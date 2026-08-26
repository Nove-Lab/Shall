import type { ChapterRule } from "./rule.js";
import { termsChapter } from "./01-terms.js";
import { goalsChapter } from "./02-goals.js";
import { actorsChapter } from "./03-actors.js";
import { responsibilitiesChapter } from "./04-responsibilities.js";
import { requirementsChapter } from "./05-requirements.js";
import { designChapter } from "./06-design.js";
import { progressChapter } from "./07-progress.js";

/**
 * The report's seven chapters, in reading order. `report.ts` iterates this
 * list and knows nothing else about any of them — adding a chapter is a file
 * and a line here.
 */
export const CHAPTERS: readonly ChapterRule[] = [
  termsChapter,
  goalsChapter,
  actorsChapter,
  responsibilitiesChapter,
  requirementsChapter,
  designChapter,
  progressChapter,
];
