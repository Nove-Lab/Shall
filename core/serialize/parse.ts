import { parseDocument } from "yaml";
import {
  attributesFor,
  formatEdgeId,
  judgeAttributes,
  judgeNodeId,
  judgeText,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import { EDGES_KEY, FENCE, NAME_KEY, SHORT_NAME_KEY } from "./emit.js";

/**
 * A file back into a node — lenient about how it was written, exact about what
 * it says.
 *
 * TWO DIFFERENT STRICTNESSES, ON PURPOSE. These files are edited by hand and by
 * agents, so a reader that refused a comment, a different quoting style or a
 * key in a different order would refuse work that is perfectly clear. Every one
 * of those is read and then canonicalized away the next time the file is
 * written, which is a diff a person can see rather than a rule they have to
 * learn. What is refused is only what is ambiguous or wrong: a fact with two
 * homes, a value that is not text, a section that belongs to no attribute.
 *
 * IT COLLECTS AND NEVER THROWS, like the judgement it delegates to. A person
 * who hand-edited a file wants everything wrong with it at once, and a file
 * with any problem at all is excluded from the graph whole — its node and its
 * edges together — because half a node is a worse answer than none.
 *
 * THE TYPE AND THE ID COME FROM THE PATH. They are the caller's to supply and
 * the file's to be silent about; a file that writes either one is refused,
 * which is the only way the folder and the filename can stay the single home of
 * each.
 */

/** What a file can say about its node: everything but the two stamps `stat` holds. */
export type ParsedNode = Omit<SpecNode, "createdAt" | "updatedAt">;

/**
 * What one file amounted to. `node` is present exactly when `problems` is
 * empty, and `edges` with it; a file with a problem contributes nothing to the
 * graph and its sentences are served instead.
 */
export interface NodeFileReading {
  readonly node?: ParsedNode;
  readonly edges: readonly SpecEdge[];
  readonly problems: readonly string[];
}

const MARKDOWN_SUFFIX = ".md";

/** The one heading level that names a section. `###` and below are prose. */
const SECTION_HEADING = /^## (.*)$/;

/** Refused wholesale rather than per-key: it is one rule about one list. */
const EDGE_SHAPE = "Every entry under edges is a map of exactly type and to.";

/**
 * THE PARSE CONTRACT, IN ONE PLACE. What the `yaml` package accepts is part of
 * the file format, so its version is pinned exactly in `package.json` and its
 * options are settled here and nowhere else — a second call site with a second
 * set of options would be a second format.
 *
 * The 1.2 core schema is the narrow one: `Yes` and `12:30` come back as the
 * strings they look like, and only `true`, `null`, numbers and the like resolve
 * away. (The emitter is wider than this on purpose, and quotes anything YAML
 * 1.1 would have resolved too, because other programs read these files.)
 * `uniqueKeys` turns a repeated key into an error instead of letting the last
 * one win silently, which is exactly the mistake a merge makes.
 *
 * `prettyErrors` is off because the message is going into a sentence a person
 * reads in a panel, and the pretty form is three lines with a caret drawn under
 * the source.
 *
 * `logLevel` IS `error` AND NOT `silent`, WHICH IS A CORRECTNESS SETTING AND NOT
 * A LOGGING ONE. The library reads `silent` in exactly one place that is not a
 * log call: it is the switch that decides whether a source holding more than one
 * document is an error at all. Silenced, `parseDocument` hands back the first
 * document and drops the rest of the file without a word — so a `...` line in
 * the middle of the frontmatter would take every key after it, and the edges
 * list with them, and the next save from the panel would make that loss
 * permanent. At `error` the library still prints nothing (it warns only at
 * `warn` and `debug`) and the dropped keys become a refusal instead.
 */
function parseFrontmatter(source: string): { value: unknown; error: string | null } {
  const document = parseDocument(source, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
    logLevel: "error",
  });
  const [error] = document.errors;
  if (error !== undefined) {
    return { value: null, error: describeParseError(error) };
  }
  return { value: document.toJS(), error: null };
}

/**
 * The library's own message, except where the library is talking to a
 * programmer. Its answer to a second document is "please use
 * YAML.parseAllDocuments()", which names a function nobody editing a markdown
 * file will ever call; what the person needs is the line in their file and what
 * it did.
 */
function describeParseError(error: { code?: string; message: string }): string {
  if (error.code === "MULTIPLE_DOCS") {
    return 'a "..." or "---" line inside it ends the document early, so the keys after that line belong to no node';
  }
  return error.message;
}

/** What a value is, in the words a refusal uses. */
function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return "a list";
  }
  if (value instanceof Date) {
    return "a date";
  }
  switch (typeof value) {
    case "number":
    case "bigint":
      return "a number";
    case "boolean":
      return "a boolean";
    // A string reaches here only from the root-shape check, where a frontmatter
    // block holding one bare scalar has to be described as something other than
    // the map it is being contrasted with — "the frontmatter is a map, not the
    // map of keys a spec file carries" is a sentence nobody can act on.
    case "string":
      return "text";
    default:
      return "a map";
  }
}

function isMap(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * The id is the filename without its extension — the loader only offers files
 * that end in `.md`, so the suffix is stripped rather than checked for.
 */
function idFromFileName(fileName: string): string {
  return fileName.endsWith(MARKDOWN_SUFFIX)
    ? fileName.slice(0, -MARKDOWN_SUFFIX.length)
    : fileName;
}

/**
 * A field of the node's own identity, judged as the write door judges it: the
 * same trim, the same two characters a text file cannot carry, then required
 * and then the control characters an id or a name must not hold. Two doors
 * judging one field differently is how a file the panel cannot save gets
 * written by the panel.
 */
function judgeIdentity(
  label: string,
  value: string,
): { value: string; problems: string[] } {
  const judged = judgeText(label, value);
  if (judged.problem !== null) {
    return { value: judged.value, problems: [judged.problem] };
  }
  if (judged.value === "") {
    return { value: judged.value, problems: [`${label} is required.`] };
  }
  if (/\p{Cc}/u.test(judged.value)) {
    return {
      value: judged.value,
      problems: [`${label} cannot contain a control character.`],
    };
  }
  return { value: judged.value, problems: [] };
}

/**
 * One file, read.
 *
 * The order the checks run in is the order a person can act on: whether this is
 * a spec file at all, then whether its frontmatter is YAML, then what its keys
 * say, then what its sections say, and only then whether what it all amounts to
 * is a node the canon allows. A sentence about a missing required slot is no
 * use to somebody whose frontmatter never closed.
 *
 * Where the answer cannot be built on, it is returned alone: an unknown type
 * has no roster, and a frontmatter that is not YAML has no keys, so there is
 * nothing further to say that would not be a guess.
 */
export function parseNodeFile(
  type: string,
  fileName: string,
  text: string,
): NodeFileReading {
  const descriptors = attributesFor(type);
  if (descriptors === null) {
    // The loader reads the type off the folder name and refuses a folder the
    // canon does not have, so this is the second fence and not the first.
    return { edges: [], problems: [`Unknown node type: ${type}`] };
  }
  const id = idFromFileName(fileName);
  const problems: string[] = [];

  // A leading byte-order mark is tolerated and dropped: Windows editors write
  // one without being asked, and the file is otherwise perfectly good. Line
  // endings are settled here for the whole file, because the door normalizes
  // them too — a value judged as CRLF and emitted as LF would make the file's
  // own re-read differ from what was written, and the fixpoint would not hold.
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  const closingFence = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || closingFence === -1) {
    return {
      edges: [],
      problems: [
        `${fileName} does not begin with a "${FENCE}" frontmatter block, so it cannot be read as a spec node.`,
      ],
    };
  }

  const frontmatter = parseFrontmatter(lines.slice(1, closingFence).join("\n"));
  if (frontmatter.error !== null) {
    return {
      edges: [],
      problems: [
        `The frontmatter is not YAML the daemon can read: ${frontmatter.error}.`,
      ],
    };
  }
  if (
    frontmatter.value !== null &&
    frontmatter.value !== undefined &&
    !isMap(frontmatter.value)
  ) {
    return {
      edges: [],
      problems: [
        `The frontmatter is ${describeValue(frontmatter.value)}, not the map of keys a spec file carries.`,
      ],
    };
  }
  // An empty block is a map with no keys rather than an error: the templates
  // ship with every value blank, and what such a file is missing is said
  // further down, by name, in the sentences a half-filled panel would produce.
  const carried: Record<string, unknown> = isMap(frontmatter.value)
    ? frontmatter.value
    : {};

  // A map and not an object, because a frontmatter key is whatever a person
  // typed: `__proto__: something` assigned into a plain object is silently
  // dropped by the prototype setter, and a key that disappears is a key nothing
  // refuses. It becomes an object once, at the door, where `Object.fromEntries`
  // makes even that name an ordinary own property.
  const raw = new Map<string, string>();
  let shortName = "";
  let name = "";
  for (const [key, value] of Object.entries(carried)) {
    if (key === EDGES_KEY) {
      continue;
    }
    if (key === "id") {
      problems.push("A spec file does not carry id — the filename is the id.");
      continue;
    }
    if (key === "type") {
      problems.push("A spec file does not carry type — the folder is the type.");
      continue;
    }
    // A key written with no value is the same as a key not written: that is
    // what the templates ship as, and what a person leaves behind when they
    // clear a cell by hand.
    if (value === null || value === undefined) {
      continue;
    }
    let held: string;
    if (typeof value === "string") {
      held = value;
    } else {
      problems.push(
        `${key} holds ${describeValue(value)}, not text. Quote the value.`,
      );
      // Kept, as the text it would have been if it had been quoted, so that the
      // slot counts as FILLED. Answering an unquoted number with "a Requirement
      // requires Statement" as well would name one mistake twice and send the
      // person to fill a field they filled. The file is refused either way, so
      // this value never reaches the graph.
      held = String(value);
    }
    if (key === SHORT_NAME_KEY) {
      shortName = held;
      continue;
    }
    if (key === NAME_KEY) {
      name = held;
      continue;
    }
    const descriptor = descriptors.find((entry) => entry.name === key);
    if (descriptor !== undefined && descriptor.kind === "prose") {
      problems.push(
        `${key} is prose and lives in the body as "## ${descriptor.label}", not in the frontmatter.`,
      );
    }
    // A name this type does not carry is left in the map deliberately: the
    // sentence against it is `judgeAttributes`', and it is written there once
    // for the doors and for this reader alike.
    raw.set(key, held);
  }

  const edges: SpecEdge[] = [];
  const listed = carried[EDGES_KEY];
  if (listed !== null && listed !== undefined) {
    if (!Array.isArray(listed)) {
      problems.push(EDGE_SHAPE);
    } else {
      let said = false;
      for (const entry of listed) {
        const edgeType = isMap(entry) ? entry["type"] : undefined;
        const target = isMap(entry) ? entry["to"] : undefined;
        if (
          !isMap(entry) ||
          Object.keys(entry).length !== 2 ||
          typeof edgeType !== "string" ||
          typeof target !== "string" ||
          edgeType === "" ||
          target === ""
        ) {
          // Once, however many entries are wrong: it is one rule, and a person
          // told it once will re-read the whole list.
          if (!said) {
            said = true;
            problems.push(EDGE_SHAPE);
          }
          continue;
        }
        edges.push({
          id: formatEdgeId(id, edgeType, target),
          type: edgeType,
          fromId: id,
          toId: target,
        });
      }
    }
  }

  // The body: everything after the closing fence, cut at every line that opens
  // a section. A heading is the delimiter, so nothing inside a section can be
  // one — which is the single restriction the prose door enforces, and the
  // reason `###`, `---`, code fences and tables are all free here.
  const prose = descriptors.filter((descriptor) => descriptor.kind === "prose");
  const preamble: string[] = [];
  const sections = new Map<string, string[]>();
  // Held apart so the stray-paragraph sentence can be said first: it is about
  // the top of the file, and a person reads a file from the top.
  const sectionProblems: string[] = [];
  let current: string[] | null = null;
  for (const line of lines.slice(closingFence + 1)) {
    const heading = SECTION_HEADING.exec(line);
    if (heading === null) {
      (current ?? preamble).push(line);
      continue;
    }
    const label = heading[1] ?? "";
    const descriptor = prose.find((entry) => entry.label === label);
    if (descriptor === undefined) {
      sectionProblems.push(
        `A ${type} does not carry "## ${label}". It carries ${prose
          .map((entry) => `"## ${entry.label}"`)
          .join(", ")} and nothing else.`,
      );
      // Its lines belong to no attribute, so they are dropped rather than
      // handed to the section before it, which would silently merge two.
      current = [];
      continue;
    }
    if (sections.has(descriptor.name)) {
      sectionProblems.push(`The file names "## ${label}" twice.`);
      current = [];
      continue;
    }
    current = [];
    sections.set(descriptor.name, current);
  }
  if (preamble.join("\n").trim() !== "") {
    problems.push(
      'Body text before the first "## " section belongs to no attribute.',
    );
  }
  problems.push(...sectionProblems);
  // The body wins over the frontmatter for a prose slot written in both. One of
  // them is already a refusal, and the body is where the value belongs.
  for (const [attribute, content] of sections) {
    // Joined and handed over untouched: the write door strips a prose value's
    // leading and trailing BLANK LINES, and doing it here as well would be a
    // second rule about the same whitespace. One rule, run in one place, is also
    // what makes the fixpoint hold — a reader that settled edges the door would
    // settle differently is the two of them disagreeing about one value.
    //
    // Blank lines rather than a trim, so that a section may open with an
    // indented code block: a trim would take the spaces off its first line only
    // and leave them on the rest, which is a different document from the one
    // that was written.
    raw.set(attribute, content.join("\n"));
  }

  const judgedId = judgeNodeId(id);
  if (judgedId !== null) {
    problems.push(judgedId);
  }
  const judgedShortName = judgeIdentity("A short name", shortName);
  problems.push(...judgedShortName.problems);
  const judgedName = judgeIdentity("A name", name);
  problems.push(...judgedName.problems);
  const judged = judgeAttributes(type, Object.fromEntries(raw));
  problems.push(...judged.problems);

  // What one file can say about its own edges. Whether the canon allows the
  // triple needs the TARGET's type, which lives in another file, so that
  // judgement belongs to the loader that has read them all.
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const edge of edges) {
    // The repetition is judged first so that a line written three times is one
    // sentence rather than three, whatever else is wrong with it.
    const triple = `${edge.type} ${edge.toId}`;
    if (seen.has(triple)) {
      if (!repeated.has(triple)) {
        repeated.add(triple);
        problems.push(
          `${id} already has a ${edge.type} relation to ${edge.toId}.`,
        );
      }
      continue;
    }
    seen.add(triple);
    // The canon has self-loops between two nodes of one type, never from a node
    // to itself.
    if (edge.toId === id) {
      problems.push(`${id} cannot relate to itself.`);
    }
  }

  if (problems.length > 0) {
    return { edges: [], problems };
  }
  return {
    node: {
      id,
      type,
      shortName: judgedShortName.value,
      name: judgedName.value,
      attributes: judged.values,
    },
    edges,
    problems,
  };
}
