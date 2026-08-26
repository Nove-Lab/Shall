/**
 * WHERE EVERY NODE LIVES — the one map from a node to the file that shows it,
 * and the arithmetic that turns a target into a relative href.
 *
 * EVERY NODE HAS A PAGE. The chapters are tables — rows of identity, edges
 * and status, the fields every node HAS — and a node's content (its facts
 * laid out in full, its body verbatim) lives on `nodes/<id>.html`, one link
 * away, so no chapter ever stacks bodies down the page. Chapters emit
 * `{ node: id }` links and never name each other's files; the renderer asks
 * this module. The map below says which chapter OWNS each type's pages — the
 * chapter that assembles them and that the page's back link returns to. All
 * 21 canon types are spoken for, and a test in `report.test.ts` holds the map
 * to the canon so a new type cannot arrive homeless.
 */

const CHAPTER_FILES = {
  "01-terms": "chapters/01-terms.html",
  "02-goals": "chapters/02-goals.html",
  "03-actors": "chapters/03-actors.html",
  "04-responsibilities": "chapters/04-responsibilities.html",
  "05-requirements": "chapters/05-requirements.html",
  "06-design": "chapters/06-design.html",
  "07-progress": "chapters/07-progress.html",
} as const;

type ChapterSlug = keyof typeof CHAPTER_FILES;

/** Which chapter assembles (and takes back) each type's pages. */
const HOME_CHAPTER: Record<string, ChapterSlug> = {
  Term: "01-terms",
  DomainEntity: "01-terms",
  Goal: "02-goals",
  Actor: "03-actors",
  UseCase: "03-actors",
  Scenario: "03-actors",
  SystemResponsibility: "04-responsibilities",
  Requirement: "05-requirements",
  AcceptanceCriterion: "05-requirements",
  Constraint: "05-requirements",
  Module: "06-design",
  Interface: "06-design",
  DataSchema: "06-design",
  Decision: "06-design",
  Finding: "06-design",
  Assumption: "06-design",
  WorkItem: "07-progress",
  Journal: "07-progress",
  WorkLog: "07-progress",
  Evidence: "07-progress",
  CompletionReport: "07-progress",
};

export interface NodeHome {
  file: string;
  anchor: string | null;
}

/** The emitted path of a node's own page. */
export function pageFileOf(id: string): string {
  return `nodes/${id}.html`;
}

export function chapterFileOf(slug: string): string {
  const file = (CHAPTER_FILES as Record<string, string>)[slug];
  if (file === undefined) {
    throw new Error(`No chapter is called ${slug}`);
  }
  return file;
}

/** Whether this type's nodes get a page of their own under `nodes/`. */
export function hasOwnPage(type: string): boolean {
  // `Object.hasOwn`, not `in`: a type called "toString" must miss, not
  // inherit a home off the prototype.
  return Object.hasOwn(HOME_CHAPTER, type);
}

/** The chapter that owns a type's pages, by slug. */
export function owningChapterOf(type: string): string | null {
  return hasOwnPage(type) ? (HOME_CHAPTER[type] ?? null) : null;
}

/**
 * Where a node of this type and id is shown, or null for a type outside the
 * canon — the renderer draws such a link as plain text rather than guessing.
 */
export function homeOf(id: string, type: string): NodeHome | null {
  return hasOwnPage(type) ? { file: pageFileOf(id), anchor: null } : null;
}

/**
 * The href from one emitted file to a target, relative so the report reads
 * the same from `file://` and from behind the daemon's route. Both paths are
 * report-relative and `/`-separated; the walk is plain segment arithmetic —
 * no `path` module, core being browser-safe.
 */
export function hrefFrom(
  fromFile: string,
  target: { file: string; anchor: string | null },
): string {
  const fromDirs = fromFile.split("/").slice(0, -1);
  const toSegments = target.file.split("/");
  let shared = 0;
  while (
    shared < fromDirs.length &&
    shared < toSegments.length - 1 &&
    fromDirs[shared] === toSegments[shared]
  ) {
    shared += 1;
  }
  const ups = fromDirs.length - shared;
  const segments = [...Array<string>(ups).fill(".."), ...toSegments.slice(shared)];
  const anchor = target.anchor === null ? "" : `#${target.anchor}`;
  // A link to the very file it stands in needs no path at all.
  if (target.file === fromFile) {
    return anchor === "" ? toSegments[toSegments.length - 1]! : anchor;
  }
  return `${segments.join("/")}${anchor}`;
}
