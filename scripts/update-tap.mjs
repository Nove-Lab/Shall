#!/usr/bin/env node
/**
 * THE TAP SAYS WHAT THE PUBLISHED RELEASE SAYS, AND NOTHING ELSE.
 *
 * `brew install nove-lab/tap/shall` is one of the two installs the site
 * advertises, and it is the only one that carries its own copy of the version
 * number and the four checksums. The other — scripts/install.sh — resolves
 * `releases/latest` on the user's machine every time, so it cannot go stale.
 * The formula can, and did: the tap sat at 0.1.5 while 0.1.6 was the release
 * the site's own badge advertised, so everyone who took the Homebrew path got
 * a build older than the page that sent them there.
 *
 * IT READS A PUBLISHED RELEASE, NEVER A TAG. release.yml cuts every release as
 * a DRAFT on purpose — the notes want reading, and both readers of "latest"
 * ask the API, which does not answer with drafts. A tap bumped on tag push
 * would advertise a build nobody had looked at, and would undo that guarantee
 * from the outside. So this takes the release, checks it is neither draft nor
 * prerelease, and refuses otherwise.
 *
 * IT WRITES THE WHOLE FORMULA, rather than patching the version and four sums
 * in place. A regex that matched four of five occurrences would leave a
 * formula that installs one platform's old binary under the new version's
 * name, and the failure would only show on that one platform.
 *
 * IT IS THE SAME CODE IN BOTH PLACES. .github/workflows/tap.yml runs it when a
 * release is published; a maintainer runs it by hand for a release that
 * predates the workflow, or after fixing one up. Two implementations would
 * drift the way the manual bumps already did.
 *
 *   node scripts/update-tap.mjs              # the latest published release
 *   node scripts/update-tap.mjs v0.1.6       # a specific one
 *   node scripts/update-tap.mjs --dry-run    # print the formula, write nothing
 *
 * Needs GITHUB_TOKEN with contents:write on Nove-Lab/homebrew-tap. Locally
 * that is `GITHUB_TOKEN=$(gh auth token)`; in Actions it is a secret, because
 * the workflow's own token is scoped to this repository and cannot write to
 * the tap.
 */
import { Buffer } from 'node:buffer';

const SOURCE_REPO = 'Nove-Lab/Shall';
const TAP_REPO = 'Nove-Lab/homebrew-tap';
const FORMULA_PATH = 'Formula/shall.rb';

/* The four names release.yml uploads, against the two axes Homebrew branches
   on. The same list is spelled out in five places across four files —
   scripts/build-binary.mjs (what bun compiles), release.yml twice (the
   sha256sum arguments and the upload list), here, and scripts/install.sh
   builds the same names from `uname` — so a fifth platform is added in all of
   them or the release is incomplete in a way only that platform sees. */
const TARGETS = [
  { os: 'macos', cpu: 'arm', asset: 'shall-darwin-arm64' },
  { os: 'macos', cpu: 'intel', asset: 'shall-darwin-x64' },
  { os: 'linux', cpu: 'arm', asset: 'shall-linux-arm64' },
  { os: 'linux', cpu: 'intel', asset: 'shall-linux-x64' },
];

const args = process.argv.slice(2);

/* An unrecognised flag is a stop, not something to ignore. `--dry-run` is the
   difference between printing a formula and publishing one, so a typo that
   silently fell through to the live path — `--dryrun`, `--dry_run` — would
   commit to the public tap while its author watched for output that never
   came. */
const FLAGS = ['--dry-run', '--allow-downgrade'];
const unknown = args.filter((a) => a.startsWith('-') && !FLAGS.includes(a));
if (unknown.length) {
  console.error(`\nunknown option ${unknown.join(' ')} — expected one of ${FLAGS.join(', ')}, or a release tag.\n`);
  process.exit(1);
}
const dryRun = args.includes('--dry-run');
const allowDowngrade = args.includes('--allow-downgrade');
const wanted = args.find((a) => !a.startsWith('-'));

const token = process.env.GITHUB_TOKEN;
if (!token && !dryRun) {
  die(
    'GITHUB_TOKEN is unset.\n' +
    '  Locally:   GITHUB_TOKEN=$(gh auth token) node scripts/update-tap.mjs\n' +
    `  In Actions: a secret with contents:write on ${TAP_REPO} — the workflow's\n` +
    '              own token is scoped to this repository and cannot write to it.'
  );
}

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'shall-update-tap',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) die(`GitHub API ${init.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}\n  ${await res.text()}`);
  return res.json();
}

// 1. The release. Latest means latest PUBLISHED — the endpoint skips drafts,
//    which is the same reason release.yml can leave them lying around safely.
const release = wanted
  ? await api(`/repos/${SOURCE_REPO}/releases/tags/${wanted.startsWith('v') ? wanted : `v${wanted}`}`)
  : await api(`/repos/${SOURCE_REPO}/releases/latest`);

if (release.draft) die(`${release.tag_name} is still a draft. Publish it first — the tap must never point at a release nobody has read.`);
if (release.prerelease) die(`${release.tag_name} is a prerelease. The tap carries the stable line only.`);

const version = release.tag_name.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) die(`${release.tag_name} is not a plain semver tag.`);

// 2. The sums, read from the release's own SHA256SUMS rather than recomputed.
//    That file is what scripts/install.sh verifies against on every install, so
//    the tap and the curl installer agree by construction.
const sumsAsset = release.assets.find((a) => a.name === 'SHA256SUMS');
if (!sumsAsset) die(`${release.tag_name} has no SHA256SUMS asset. It was not built by release.yml.`);

const sumsText = await fetch(sumsAsset.browser_download_url, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
}).then((r) => (r.ok ? r.text() : die(`could not download SHA256SUMS → ${r.status}`)));

const sums = new Map(
  sumsText.trim().split('\n').map((line) => {
    const [sum, name] = line.trim().split(/\s+/);
    return [name, sum];
  })
);

for (const { asset } of TARGETS) {
  if (!/^[0-9a-f]{64}$/.test(sums.get(asset) ?? '')) die(`SHA256SUMS has no usable line for ${asset}.`);
  if (!release.assets.some((a) => a.name === asset)) die(`${release.tag_name} is missing the ${asset} binary.`);
}

// 3. The formula, written whole.
// The release's own tag, not `v${version}` rebuilt from it. A tag written
// without the `v` would send every download URL to a release that does not
// exist, and the formula would still look perfectly well formed.
const base = `https://github.com/${SOURCE_REPO}/releases/download/${release.tag_name}`;
const block = (cpu, asset) =>
  `    on_${cpu} do\n` +
  `      url "${base}/${asset}"\n` +
  `      sha256 "${sums.get(asset)}"\n` +
  `    end`;
const platform = (os) =>
  `  on_${os} do\n` +
  TARGETS.filter((t) => t.os === os).map((t) => block(t.cpu, t.asset)).join('\n') +
  `\n  end`;

const formula = `class Shall < Formula
  desc "Spec as the control plane for your agents"
  homepage "https://shall.sh"
  version "${version}"
  license "AGPL-3.0-only"

${platform('macos')}

${platform('linux')}

  def install
    bin.install Dir["shall-*"].first => "shall"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/shall --version").strip
  end
end
`;

if (dryRun) {
  process.stdout.write(formula);
  console.error(`\n(dry run — ${TAP_REPO}/${FORMULA_PATH} not written; would be v${version})\n`);
  process.exit(0);
}

// 4. The commit. Read-then-write against the file's blob sha, so a tap somebody
//    edited by hand in the meantime fails the write rather than losing it.
const current = await api(`/repos/${TAP_REPO}/contents/${FORMULA_PATH}`);
const currentText = Buffer.from(current.content, 'base64').toString('utf8');

/*
 * THE TAP ONLY EVER MOVES FORWARD.
 *
 * Every guard above asks whether a release is fit to publish; none asked
 * whether it is NEWER than what the tap already serves. `update-tap.mjs v0.1.4`
 * passes all of them — it is a real published release with all five assets —
 * and would hand every `brew install` an older binary, which is the exact bug
 * this script exists to end. A dispatch input is one mistyped tag away from it.
 */
const currentVersion = currentText.match(/^\s*version "([^"]+)"/m)?.[1];
const rank = (v) => v.split('.').map(Number);
const older = (a, b) => {
  const [x, y] = [rank(a), rank(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};
if (currentVersion && older(version, currentVersion) && !allowDowngrade) {
  die(
    `the tap is at ${currentVersion} and this would take it back to ${version}.\n` +
    '  Every `brew install` would get the older binary. Pass --allow-downgrade if\n' +
    '  that is genuinely what you want — pulling a bad release, say.'
  );
}

if (currentText === formula) {
  console.log(`${TAP_REPO} is already at ${version} — nothing to do.`);
  process.exit(0);
}

await api(`/repos/${TAP_REPO}/contents/${FORMULA_PATH}`, {
  method: 'PUT',
  body: JSON.stringify({
    message: `shall ${version}`,
    content: Buffer.from(formula, 'utf8').toString('base64'),
    sha: current.sha,
  }),
});

console.log(`${TAP_REPO}/${FORMULA_PATH} → ${version}`);
for (const { asset } of TARGETS) console.log(`  ${sums.get(asset).slice(0, 12)}…  ${asset}`);
