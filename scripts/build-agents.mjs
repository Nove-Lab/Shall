import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The agent tree's generator.
 *
 * ONE PROCESS, MANY AGENTS. `agents/core` says what a Shall process does, in
 * sentences that name no tool and no folder; `agents/profiles/<agent>` says how
 * that agent spells it. This script multiplies the two into
 * `agents/dist/<agent>`, which is what a session actually reads and what git
 * ignores. So a change to a procedure is a change to one file under core, and a
 * new agent is a new folder under profiles with core untouched.
 *
 * A PLACEHOLDER IS A CONTRACT, AND IT IS CHECKED BOTH WAYS. Core writes
 * `{{token}}` wherever the sentence would otherwise name Claude; a profile that
 * does not define a token core uses stops the build, and a token no profile
 * knows stops it naming the file and line. Neither can be discovered later:
 * the failure would be an agent reading a brace in the middle of a procedure.
 *
 * `--parity` PROVED THE MOVE. It regenerates the claude tree and compares it
 * byte for byte against a hand-written folder, so the day the generated tree
 * replaced the written one, nothing an agent reads changed. Point it at a
 * folder with `--against=<path>`; it is kept because the same proof is what any
 * later restructuring of core owes its readers.
 */

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDirectory);
const agentsRoot = path.join(repoRoot, "agents");
const coreRoot = path.join(agentsRoot, "core");
const profilesRoot = path.join(agentsRoot, "profiles");
const distRoot = path.join(agentsRoot, "dist");

/** `{{token}}` and `{{block arg arg}}` — lowercase inside the braces, always. */
const TOKEN = /\{\{([a-zA-Z][a-zA-Z-]*)((?:\s+[^\s{}]+)*)\}\}/g;

const problems = [];

function fail(where, sentence) {
  problems.push(`${where} — ${sentence}`);
}

/** Every file under a folder, "/"-separated and sorted, so a build is deterministic. */
async function filesUnder(folder, prefix = "") {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...(await filesUnder(path.join(folder, entry.name), relative)));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found;
}

/**
 * A core document's frontmatter, as written keys, plus the body under it.
 *
 * The parse is deliberately narrow — one `key: value` per line, no nesting, no
 * folding — because that is the whole of what core writes, and a parser that
 * accepted more would accept a file no profile could render.
 */
function splitDocument(source, relative) {
  if (!source.startsWith("---\n")) {
    fail(relative, "a core document opens with its frontmatter, and this one does not.");
    return { fields: {}, body: source };
  }
  const close = source.indexOf("\n---\n", 4);
  if (close === -1) {
    fail(relative, "the frontmatter is never closed.");
    return { fields: {}, body: source };
  }
  const fields = {};
  for (const line of source.slice(4, close).split("\n")) {
    const at = line.indexOf(": ");
    if (at === -1) {
      fail(relative, `\`${line}\` is not a \`key: value\` line, and core frontmatter is nothing else.`);
      continue;
    }
    fields[line.slice(0, at)] = line.slice(at + 2);
  }
  return { fields, body: source.slice(close + "\n---\n".length) };
}

/**
 * Expands every placeholder in one core file against one profile.
 *
 * The line number is counted from the text as core wrote it, so an unknown
 * token is reported where an author would look for it.
 */
function expand(body, profile, relative) {
  let line = 1;
  let at = 0;
  return body.replace(TOKEN, (whole, token, rest, index) => {
    while (at < index) {
      if (body[at] === "\n") {
        line += 1;
      }
      at += 1;
    }
    const names = rest.trim() === "" ? [] : rest.trim().split(/\s+/);
    if (names.length > 0) {
      const render = profile.blocks?.[token];
      if (typeof render !== "function") {
        fail(
          `${relative}:${line}`,
          `{{${token} …}} is a block this profile does not render. Add it to the profile's \`blocks\`, or stop using it in core.`,
        );
        return whole;
      }
      return render(names);
    }
    const value = profile.vocabulary?.[token];
    if (typeof value !== "string") {
      fail(
        `${relative}:${line}`,
        `{{${token}}} is a placeholder this profile does not define. Every token core uses is every profile's to answer.`,
      );
      return whole;
    }
    return value;
  });
}

/** The invocation-name table, longest source first so no rename eats another's prefix. */
function applyNames(text, profile) {
  let out = text;
  for (const [from, to] of [...profile.names].sort(
    ([left], [right]) => right.length - left.length,
  )) {
    out = out.split(from).join(to);
  }
  return out;
}

/** Renders one profile's whole tree into memory, so nothing is written until it all builds. */
async function renderProfile(agent, profile) {
  const files = new Map();
  const skills = new Set(
    await readdir(path.join(coreRoot, "skills")).catch(() => []),
  );

  for (const relative of await filesUnder(coreRoot)) {
    const target = profile.targetOf(relative);
    if (target === null) {
      continue;
    }
    const full = path.join(coreRoot, ...relative.split("/"));
    if (!relative.endsWith(".md")) {
      files.set(target, await readFile(full));
      continue;
    }
    const source = await readFile(full, "utf8");
    // A skill's reference pages carry no frontmatter — the page they hang off
    // does — so they are prose all the way down and only the tokens move.
    const front = relative.startsWith("entries/")
      ? profile.entryFrontmatter
      : path.basename(relative) === "SKILL.md"
        ? profile.skillFrontmatter
        : null;
    if (front === null) {
      files.set(target, Buffer.from(applyNames(expand(source, profile, relative), profile)));
      continue;
    }
    const { fields, body } = splitDocument(source, relative);
    // The name table is applied to the assembled file, frontmatter included: a
    // skill's `description` says which command loads it, and a profile that
    // renamed the commands and not that sentence would ship a catalog line
    // pointing at a command it does not have.
    const document = `---\n${front(fields, relative).join("\n")}\n---\n${expand(body, profile, relative)}`;
    files.set(target, Buffer.from(applyNames(document, profile)));

    // Every entry loads skills that exist. A typo here is a session that reads
    // a path with nothing behind it and carries on without the process.
    if (relative.startsWith("entries/")) {
      for (const match of body.matchAll(/\{\{load-skills\s+([^{}]+)\}\}/g)) {
        for (const name of match[1].trim().split(/\s+/)) {
          if (!skills.has(name)) {
            fail(relative, `loads \`${name}\`, and \`agents/core/skills/${name}\` does not exist.`);
          }
        }
      }
    }
  }

  const staticFolder = path.join(profilesRoot, agent, profile.staticRoot);
  for (const relative of await filesUnder(staticFolder)) {
    files.set(relative, await readFile(path.join(staticFolder, ...relative.split("/"))));
  }

  // Post-conditions, in process: a brace that survived is a placeholder that
  // was never expanded, and it would reach a session as literal text.
  for (const [target, bytes] of files) {
    if (target.endsWith(".md") && bytes.includes("{{")) {
      fail(`${agent}/${target}`, "still carries `{{` after rendering, so a placeholder went out unexpanded.");
    }
  }
  return files;
}

/** Which agents have a profile, in a fixed order. */
async function profileNames() {
  const entries = await readdir(profilesRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function loadProfile(agent) {
  const modulePath = path.join(profilesRoot, agent, "profile.mjs");
  return import(`file://${modulePath}`);
}

async function writeTree(agent, files) {
  const target = path.join(distRoot, agent);
  await rm(target, { recursive: true, force: true });
  for (const relative of [...files.keys()].sort()) {
    const full = path.join(target, ...relative.split("/"));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, files.get(relative));
  }
}

/** A path said the shortest way that still points at it — a folder outside the repo stays absolute. */
function saidAs(target) {
  const relative = path.relative(repoRoot, target);
  return relative.startsWith("..") ? target : relative;
}

/**
 * The byte comparison. Only the file set the generator owns is compared: a
 * hand-written tree may carry a README the generated one has no business
 * reproducing, and the folder said so.
 */
async function compare(files, against) {
  const differences = [];
  const generated = new Set(files.keys());
  for (const relative of [...generated].sort()) {
    const full = path.join(against, ...relative.split("/"));
    const bytes = await readFile(full).catch(() => null);
    if (bytes === null) {
      differences.push(`${relative} — generated, and absent from ${saidAs(against)}`);
      continue;
    }
    if (!bytes.equals(files.get(relative))) {
      differences.push(`${relative} — bytes differ`);
    }
  }
  for (const relative of await filesUnder(against)) {
    if (!generated.has(relative) && relative !== "README.md") {
      differences.push(`${relative} — present in ${saidAs(against)}, and never generated`);
    }
  }
  return differences;
}

const asked = process.argv.slice(2);
const parity = asked.includes("--parity");
const againstFlag = asked.find((argument) => argument.startsWith("--against="));
const unknown = asked.filter(
  (argument) => argument !== "--parity" && !argument.startsWith("--against="),
);
if (unknown.length > 0) {
  console.error(`build-agents: unknown option: ${unknown.join(", ")}`);
  process.exit(1);
}

if ((await stat(coreRoot).catch(() => null)) === null) {
  console.error(`build-agents: there is no ${path.relative(repoRoot, coreRoot)} to build from.`);
  process.exit(1);
}

const agents = await profileNames();
if (agents.length === 0) {
  console.error(`build-agents: no profile under ${path.relative(repoRoot, profilesRoot)} — there is nothing to build.`);
  process.exit(1);
}

const rendered = new Map();
for (const agent of agents) {
  rendered.set(agent, await renderProfile(agent, await loadProfile(agent)));
}

if (problems.length > 0) {
  for (const problem of problems.sort()) {
    console.error(`build-agents: ${problem}`);
  }
  process.exit(1);
}

if (parity) {
  const against = againstFlag
    ? path.resolve(repoRoot, againstFlag.slice("--against=".length))
    : path.join(agentsRoot, "claude");
  if ((await stat(against).catch(() => null)) === null) {
    console.error(
      `build-agents: there is no ${saidAs(against)} to compare against. The hand-written folder this mode was built to prove is retired; point it at a folder with --against=<path> — a worktree of the commit before the move is the usual one.`,
    );
    process.exit(1);
  }
  const differences = await compare(rendered.get("claude"), against);
  if (differences.length > 0) {
    console.error(
      `build-agents: dist/claude is not byte-identical to ${saidAs(against)}:`,
    );
    for (const difference of differences) {
      console.error(`  ${difference}`);
    }
    process.exit(1);
  }
  console.log(
    `build-agents: dist/claude is byte-identical to ${saidAs(against)} across ${rendered.get("claude").size} files.`,
  );
}

for (const agent of agents) {
  await writeTree(agent, rendered.get(agent));
  console.log(`build-agents: wrote ${rendered.get(agent).size} files to agents/dist/${agent}.`);
}
