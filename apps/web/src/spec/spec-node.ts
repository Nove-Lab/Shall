/** A row of the project's `nodes` table — the Spec plane's whole record. */
export interface SpecNode {
  id: string;
  type: string;
  /** A JSON object, stored as text. */
  attrs: string;
  createdAt: number;
}

/** The two columns a person fills in; the rest is the node's identity. */
export interface SpecNodeValues {
  type: string;
  attrs: string;
}

/** What an empty attrs field starts as, in the editor and on a new node. */
export const EMPTY_ATTRS = "{}";

/** Stored compact, shown indented wherever a person reads or edits it. */
export function formatAttrs(attrs: string): string {
  try {
    return JSON.stringify(JSON.parse(attrs) as unknown, null, 2);
  } catch {
    return attrs;
  }
}

/** The reason attrs cannot be saved, or null when it can. */
export function attrsProblem(attrs: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(attrs);
  } catch {
    return "Attributes must be valid JSON.";
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "Attributes must be a JSON object.";
  }
  return null;
}

/** All a node card can say about its attrs without opening the panel. */
export function describeAttrs(attrs: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(attrs);
  } catch {
    return "Unreadable attributes";
  }

  const count =
    typeof parsed === "object" && parsed !== null
      ? Object.keys(parsed).length
      : 0;
  if (count === 0) {
    return "No attributes";
  }
  return count === 1 ? "1 attribute" : `${count} attributes`;
}

export function formatCreatedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleString();
}
