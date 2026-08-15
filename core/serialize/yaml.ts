import { isMap as isYamlMap, isScalar, parseDocument } from "yaml";
import { judgeText } from "../graph/index.js";

/**
 * The YAML both of Shall's files are read with — a node file's frontmatter and
 * the approval ledger — settled once, here.
 *
 * THE PARSE CONTRACT, IN ONE PLACE. What the `yaml` package accepts is part of
 * the file format, so its version is pinned exactly in `package.json` and its
 * options are settled in this module and nowhere else — a second call site with
 * a second set of options would be a second format. Two readers share one
 * grammar by importing this file, never by copying the options.
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

/**
 * What one YAML source amounted to. `error` is the library's own code and
 * message, unpretty, for the caller to put into a sentence of its own
 * vocabulary; `value` is `document.toJS()` — plain maps, arrays and scalars.
 *
 * `rootKeys` IS THE ONE FACT `toJS()` LOSES. A map whose keys `1234` and
 * `"1234"` are both written is two entries to the library — a number and a
 * string, so `uniqueKeys` has nothing to say — and ONE property to JavaScript,
 * where every key is a string. The keys are read off the document before that
 * collapse, each spelled as the string `toJS()` makes of it (a null key becomes
 * the empty string there, and does here), so a reader whose keys are
 * identities (the ledger's node ids) can tell that a fact was written twice.
 * Null when the root is not a map.
 */
export interface YamlError {
  readonly code: string | undefined;
  readonly message: string;
}

export interface YamlReading {
  readonly value: unknown;
  readonly error: YamlError | null;
  readonly rootKeys: readonly string[] | null;
}

export function readYaml(source: string): YamlReading {
  const document = parseDocument(source, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
    logLevel: "error",
  });
  const [error] = document.errors;
  if (error !== undefined) {
    return {
      value: null,
      error: { code: error.code, message: error.message },
      rootKeys: null,
    };
  }
  const contents: unknown = document.contents;
  return {
    value: document.toJS(),
    error: null,
    rootKeys: isYamlMap(contents)
      ? contents.items.map((item) => keyText(item.key))
      : null,
  };
}

/** A key as `toJS()` spells it: null is the empty string, everything else its text. */
function keyText(key: unknown): string {
  if (isScalar(key)) {
    return key.value === null ? "" : String(key.value);
  }
  return String(key);
}

/** What a value is, in the words a refusal uses. */
export function describeValue(value: unknown): string {
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
    // A string reaches here only from a root-shape check, where a document
    // holding one bare scalar has to be described as something other than the
    // map it is being contrasted with — "the frontmatter is a map, not the map
    // of keys a spec file carries" is a sentence nobody can act on.
    case "string":
      return "text";
    default:
      return "a map";
  }
}

export function isMap(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * A block as the strings it claims to be, or null when its shape is not the
 * exact tuple asked for. Every named key must be present as text and no other
 * key may stand beside them — the length check plus the per-key check is both
 * halves of that at once.
 */
export function readStringMap(
  value: unknown,
  keys: readonly string[],
): Record<string, string> | null {
  if (!isMap(value)) {
    return null;
  }
  if (Object.keys(value).length !== keys.length) {
    return null;
  }
  const held: Record<string, string> = {};
  for (const key of keys) {
    const field = value[key];
    if (typeof field !== "string") {
      return null;
    }
    held[key] = field;
  }
  return held;
}

/**
 * A field of a record's own identity, judged as the write door judges it: the
 * same trim, the same two characters a text file cannot carry, then required
 * and then the control characters an id or a name must not hold. Two doors
 * judging one field differently is how a file the panel cannot save gets
 * written by the panel.
 */
export function judgeIdentity(
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
