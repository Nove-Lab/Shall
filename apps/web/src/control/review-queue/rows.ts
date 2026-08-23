import type { BundleKind, ReviewBundle } from "@/spec/review";
import { countWord } from "../parts";

/**
 * The queue's row vocabulary, importable without the queue's table: the glance
 * on the overview and the bundle's own page both read these, and before this
 * file they imported the whole `ReviewQueue` component — `Table`, `Card` and
 * all — to get a label. The board's `work-board/rows.ts` is the same shape next
 * door.
 */

/**
 * THE FIVE KINDS IN A PERSON'S WORDS, IN ONE PLACE. `Record<BundleKind, …>`
 * and not a loose map: a sixth kind decided in `core/arith/bundles.ts` is a
 * compile error at this table rather than a badge that renders a wire word.
 * The card page reads the same map, so the badge on the row and the badge on
 * the page it opens cannot disagree.
 */
export const KIND_LABEL: Record<BundleKind, string> = {
  "spec-approval": "Spec approval",
  "work-report": "Work report",
  "standalone-finding": "Standalone finding",
  "ac-closure": "AC closure",
  "work-item-closure": "Work item closure",
};

/**
 * HOW BIG THIS DECISION IS, IN ONE LINE, AND EACH KIND MEASURES ITSELF.
 *
 * A spec approval is counted in nodes, because that is what approving it signs
 * off — and the unchanged ones are counted BESIDE them rather than folded in,
 * since agreeing to a changed requirement is also a statement that the criteria
 * nobody touched still say the right thing. A rejected member is named only
 * when there is one: it is a row that is already the agent's turn, and a "0
 * rejected" on every other line would be noise.
 *
 * A work report is counted by TYPE, because "eleven nodes" says nothing about
 * whether this is one log with ten pieces of evidence or ten logs. An AC
 * closure is counted in CLAIMANTS, all of them and whatever colour each wears:
 * closing accepts the whole list, so the list is what the number has to be.
 */
export function bundleSummary(bundle: ReviewBundle): string {
  switch (bundle.kind) {
    case "spec-approval": {
      const rejected = bundle.members.filter(
        (member) => member.reason === "rejected",
      ).length;
      const aside = [`${String(bundle.unchanged.length)} unchanged`];
      if (rejected > 0) {
        aside.push(`${String(rejected)} rejected`);
      }
      return `${countWord(bundle.members.length, "node")} (${aside.join(", ")})`;
    }
    case "work-report":
      return bundle.counts.length === 0
        ? countWord(bundle.members.length, "node")
        : bundle.counts
            .map((count) => `${count.type} ${String(count.count)}`)
            .join(", ");
    // ONE FINDING, AND THE TITLE ALREADY SAYS WHICH. The row's job here is to
    // say what kind of reading is waiting rather than how much of it: a card
    // holding one node needs no arithmetic on the line above it.
    case "standalone-finding":
      return countWord(bundle.members.length, "finding");
    case "ac-closure":
      return `evidence ${String(bundle.evidence.length)}`;
    // A WORK ITEM IS COUNTED IN REPORTS, for the reason a criterion is counted in
    // evidence: closing accepts the whole list, so the list is the number.
    case "work-item-closure":
      return `reports ${String(bundle.reports.length)}`;
  }
}
