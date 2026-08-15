import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import {
  colorContextOf,
  colorOf,
  type ColorSubject,
  type ColorVerdict,
  type Seal,
} from "./color.js";

/**
 * The whole project, coloured — one pass over a loaded graph, and the three
 * lists a review screen or `shall check` is made of.
 *
 * THE THREE LISTS ARE THREE KINDS OF WORK AND NOT THREE SEVERITIES. `statuses`
 * is every node that has a colour; `missing` is the ids something still points
 * at with nothing behind them, each with the referrers that would have to be
 * re-anchored; `broken` is the files that would not read, which is a fix a
 * person makes in an editor rather than in a panel.
 *
 * A FILE THAT WILL NOT READ IS A FIX WHEREVER IT SITS, so refused files go
 * straight to `broken` without the colour chain. The chain's vocabulary — green,
 * yellow, anchored, approved — belongs to living nodes of the living bands, and
 * a `WorkLog` whose frontmatter somebody broke is outside that vocabulary and
 * still work somebody has to do. Routing it through `colorOf` would drop it on
 * the band guard, which would be the composition making a judgement of its own.
 * Missing ids keep using the chain: they have no band, no file and no folder to
 * be outside anything.
 *
 * NOTHING HERE IS STORED. It is recomputed from the graph on every read, like
 * everything else in `core/arith`, which is what lets a hand edit or a
 * `git checkout` change a colour with nobody told about it.
 */

/** One node that has a colour, and the one word for why. */
export interface ReviewStatus {
  id: string;
  color: "red" | "yellow" | "green";
  reason: ColorVerdict["reason"];
}

/** An id with nothing behind it, and everything still pointing at it. */
export interface MissingNode {
  id: string;
  referencedBy: { fromId: string; type: string }[];
}

/** A file that would not read, with every sentence against it. */
export interface BrokenFile {
  file: string;
  problems: string[];
}

export interface GraphReview {
  statuses: ReviewStatus[];
  missing: MissingNode[];
  broken: BrokenFile[];
}

/**
 * Byte order, not locale order — the same choice `core/store` makes, for the
 * same reason: ids and paths are ASCII, and a review that sorted by the daemon's
 * locale would put its own output at the mercy of an environment variable.
 */
function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** A refused file, said as the review says it — its own sentences, copied out. */
function brokenOf(refusal: RefusedFile): BrokenFile {
  return { file: refusal.file, problems: [...refusal.problems] };
}

export function reviewGraph(graph: SpecGraph, seal: Seal): GraphReview {
  const context = colorContextOf(graph, seal);
  const statuses: ReviewStatus[] = [];
  const missing: MissingNode[] = [];
  const broken: BrokenFile[] = [];

  for (const node of graph.nodes) {
    const subject: ColorSubject = {
      id: node.id,
      type: node.type,
      present: true,
      node,
      problems: [],
    };
    const verdict = colorOf(subject, context);
    if (verdict === null) {
      // A type outside the canon, which the loader never serves as a node —
      // kept as the honest shape of `colorOf`'s answer rather than cast away.
      continue;
    }
    // A node that parsed is present and problem-free, so `missing` and
    // `malformed` cannot come back for one — every other reason is a status.
    statuses.push({ id: node.id, color: verdict.color, reason: verdict.reason });
  }

  // Both an id a node holds and an id a refused file holds are CLAIMED: there is
  // a file at that path either way, so nothing about it is missing. The refused
  // one is broken instead, which is the next list down.
  const claimed = new Set<string>(context.living);
  const refusedFiles = new Set<string>();
  for (const refusal of graph.refused) {
    claimed.add(refusal.id);
    refusedFiles.add(refusal.file);
    broken.push(brokenOf(refusal));
  }

  // Every id an edge names that nothing on disk answers to. Enumerated from the
  // edges, so each of these has at least one referrer by construction — and the
  // verdict is still read rather than assumed, because a subject that came back
  // as anything else would be a change in the chain and not a row for this list.
  const asked = new Set<string>();
  for (const edge of graph.edges) {
    if (claimed.has(edge.toId) || asked.has(edge.toId)) {
      continue;
    }
    asked.add(edge.toId);
    // NOTHING IS DERIVED FROM THE ID. There is no file, so there is no folder,
    // so there is no type — and reading one off the id's prefix would be
    // inventing a fact about a node nobody has.
    const subject: ColorSubject = {
      id: edge.toId,
      type: null,
      present: false,
      node: null,
      problems: [],
    };
    const verdict = colorOf(subject, context);
    if (verdict === null || verdict.reason !== "missing") {
      continue;
    }
    const referencedBy = (context.incoming.get(edge.toId) ?? [])
      .map((referrer) => ({ fromId: referrer.fromId, type: referrer.type }))
      .sort(
        (a, b) => compare(a.fromId, b.fromId) || compare(a.type, b.type),
      );
    missing.push({ id: edge.toId, referencedBy });
  }

  // A shut folder, a stray `.md` at the top of the tree, a type folder in the
  // wrong band: no subject to colour, and still red on a screen. Grouped by
  // file, because the fix is per file and a person reads it that way, and the
  // sentences keep the order the loader produced them in.
  const strays = new Map<string, string[]>();
  for (const problem of graph.problems) {
    if (refusedFiles.has(problem.file)) {
      // Already a row above, said in full. Repeating it here would show one
      // broken file twice.
      continue;
    }
    const held = strays.get(problem.file);
    if (held === undefined) {
      strays.set(problem.file, [problem.message]);
    } else {
      held.push(problem.message);
    }
  }
  for (const [file, problems] of strays) {
    broken.push({ file, problems });
  }

  statuses.sort((a, b) => compare(a.id, b.id));
  missing.sort((a, b) => compare(a.id, b.id));
  broken.sort((a, b) => compare(a.file, b.file));

  return { statuses, missing, broken };
}
