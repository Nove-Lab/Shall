import { runBundled } from "../dist/binary-main.js";
import { EMBEDDED_FILES } from "./assets.generated.js";

/**
 * WHAT `bun build --compile` IS POINTED AT — the only file in Shall that is not
 * part of any `tsc` project, and it holds three lines so that nothing worth
 * typechecking is out here. The build writes `assets.generated.ts` beside it
 * (git ignores that file; `scripts/build-binary.mjs` makes it), and everything
 * this hands over is checked where it lives, next door in `src`.
 *
 * IT SITS IN `client/cli` AND NOT IN `scripts` FOR ONE REASON: bun installs
 * workspace dependencies into each workspace's own `node_modules`, so a bundle
 * rooted at the repository root would resolve neither `@shall/daemon` nor the
 * daemon's own hono. Rooted here, every import resolves the way it does when
 * node runs the same files.
 */

await runBundled(EMBEDDED_FILES);
