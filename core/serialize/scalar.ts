/**
 * One value, one YAML scalar — the rule every byte of frontmatter rests on.
 *
 * IT IS HAND-WRITTEN, AND THAT IS THE POINT. The `yaml` package reads these
 * files; it never writes one. A library is entitled to change its mind about
 * where it puts a quotation mark between two patch releases, and every such
 * change would rewrite files a person already committed — `git diff` would
 * report that a specification changed on a day nobody touched it. So the
 * emitter owes nothing to a dependency, and an upgrade cannot move a byte.
 *
 * IT IS DELIBERATELY OVER-CAUTIOUS. The rule quotes values that plain would
 * have carried perfectly well, and that costs two quotation marks and nothing
 * else. What it must never do is emit a plain form that a reader resolves to
 * something other than the string it was handed: `true` coming back a boolean,
 * `12:30` coming back 750, `2026-08-14` coming back a date. Those are what this
 * file exists to catch.
 *
 * IT JUDGES AGAINST YAML 1.1 AND 1.2 AT ONCE. Our own reader is pinned to the
 * 1.2 core schema, where `Yes`, `12:30` and `0b1010` are all plain strings —
 * but our reader is not the only program that will ever open these files. An
 * editor's frontmatter plugin, a static-site generator or a colleague's script
 * may still be reading 1.1, where none of the three is a string. A file in a
 * repository is read by whatever the repository is checked out next to, so the
 * union of the two versions is the honest audience.
 */

/**
 * The characters that mean something to YAML in the FIRST position of a plain
 * scalar — the indicators, the two reserved characters `@` and backtick, and a
 * leading space, which a reader would eat. Later positions are safe for all of
 * them; only `:` and `#` go on mattering mid-value, and those have clauses of
 * their own below.
 */
const PLAIN_UNSAFE_FIRST = "-?:,[]{}#&*!|>'\"%@` ";

/**
 * The characters that never appear literally in a scalar this module writes.
 * They force the quotation marks, and inside the quotation marks they are
 * escaped — ONE CLASS USED TWICE, so the two halves of the rule cannot drift
 * apart and no character is refused plain only to be written raw.
 *
 * C0 with its tab, DEL and C1 are not in YAML's printable set at all. U+2028,
 * U+2029 and U+0085 are LINE BREAKS to YAML 1.1, so a plain scalar holding one
 * would fold and come back with a space where a paragraph mark was — the exact
 * failure this file exists to prevent, and a reachable one: the attribute door
 * counts U+2028 as the line break it is, but a short name and a name are judged
 * only for the C-class controls, so one can reach the frontmatter. U+FEFF is
 * how a stream announces its encoding, and a reader is entitled to strip it
 * wherever it turns up.
 */
const NEVER_LITERAL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFEFF]/;

/**
 * The forms that resolve to something other than a string, in YAML 1.1, in the
 * 1.2 core schema, or in either. Matched against the WHOLE value and
 * case-insensitively, because 1.1 spells its booleans `Yes`, `YES` and `yes`
 * alike.
 *
 * The sign is written into each form rather than hoisted, because it is not
 * allowed everywhere: `-0x1A` is a number and `-true` is a word. It is nearly
 * academic here — a leading `-` already fails the first-character rule — but
 * this predicate is read as a standalone statement about what is safe, so it
 * states the whole truth rather than leaning on another clause.
 *
 * The underscores are 1.1's digit separators, and they are why several of these
 * are wider than the 1.2 grammar they are named after: 1.1 reads `1_000` as a
 * thousand and `0x1_A` as twenty-six.
 */
const NON_STRING_FORMS: readonly RegExp[] = [
  // 1.1's booleans, which subsume 1.2's `true` and `false`. `y` and `n` are
  // 1.1's alone, and are exactly the one-letter value a person types into a
  // column that wants a yes or a no.
  /^(?:y|n|yes|no|true|false|on|off)$/i,
  // Null, both versions, and the tilde. The empty string resolves to null too,
  // and is refused above where emptiness is easier to say.
  /^(?:null|~)$/i,
  // The infinities and the not-a-number.
  /^[-+]?\.(?:inf|nan)$/i,
  // Decimal, with 1.1's separators.
  /^[-+]?[0-9][0-9_]*$/,
  // 1.2's explicit octal, 1.1's leading-zero octal, hexadecimal, and 1.1's
  // binary, which 1.2 does not have: `0b1010` is ten to one reader and a string
  // to the other, which is the whole reason this list unions the two.
  /^[-+]?0o[0-7_]+$/,
  /^[-+]?0[0-7_]+$/,
  /^[-+]?0x[0-9a-f_]+$/i,
  /^[-+]?0b[01_]+$/,
  // Floats, including the leading-dot and trailing-dot spellings 1.1 allows.
  /^[-+]?(?:\.[0-9_]+|[0-9][0-9_]*(?:\.[0-9_]*)?)(?:e[-+]?[0-9]+)?$/i,
  // And 1.1's float grammar as 1.1 actually writes it, where EVERY part before
  // the exponent is optional: `e10` and `.` are floats to a 1.1 reader — NaN,
  // in fact — and a mantissa the line above insists on is a mantissa 1.1 does
  // not require. These two subsume the line above rather than replacing it,
  // because that one is the 1.2 grammar and both audiences are real.
  /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
  /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
  // Sexagesimal — base sixty, which 1.1 resolves without being asked. This is
  // the form that turns a clock time or a duration typed into a `line` slot
  // into an integer: `12:30` is 750.
  /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
  /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
  // Timestamp-shaped, and quoted wholesale rather than parsed. 1.1's timestamp
  // grammar is long and its edges are not worth learning: anything opening with
  // a year, a month and a day is quoted, which costs two characters on a value
  // like `2026-08-14 release` and buys certainty on the ones that matter.
  /^\d{4}-\d{1,2}-\d{1,2}/,
];

/**
 * The same class, applied inside the quotation marks. `JSON.stringify` escapes
 * C0 and leaves everything above it literal, so this second pass is what turns
 * DEL, C1, the three exotic line breaks and the byte-order mark into the
 * `\uXXXX` that YAML's double-quoted style accepts. Built from the source of
 * the class above rather than written out again, because two lists of the same
 * characters are two lists that can disagree.
 */
const NEEDS_UNICODE_ESCAPE = new RegExp(NEVER_LITERAL.source, "g");

/**
 * Whether this value may be written without quotation marks — the frozen
 * predicate, stated as one list so a reader can check it against a YAML grammar
 * line by line.
 *
 * A value the doors have judged never reaches the empty, leading-space or
 * trailing-space clauses: `judgeText` trims, and its callers drop what is left
 * empty. They are written anyway, because this function is exported and its
 * answer has to be true on its own terms rather than true given a caller.
 */
export function isPlainSafe(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  if (NEVER_LITERAL.test(value)) {
    return false;
  }
  const first = value[0] ?? "";
  if (PLAIN_UNSAFE_FIRST.includes(first)) {
    return false;
  }
  // A plain scalar loses its trailing whitespace to the reader, so a value that
  // ends in a space would come back a different value; a value that ends in a
  // colon would come back a mapping key.
  if (value.endsWith(" ") || value.endsWith(":")) {
    return false;
  }
  // The two sequences that end a plain scalar in the middle of itself: `: `
  // opens a mapping and ` #` opens a comment. Nothing else mid-value matters.
  if (value.includes(": ") || value.includes(" #")) {
    return false;
  }
  return !NON_STRING_FORMS.some((form) => form.test(value));
}

/** One character as YAML's four-digit escape, lower case, as JSON writes its own. */
function unicodeEscape(character: string): string {
  return `\\u${(character.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;
}

/**
 * The value as one YAML scalar: plain where that is provably safe, and
 * double-quoted otherwise.
 *
 * `JSON.stringify` writes the quoted form, because JSON's escapes are a subset
 * of YAML's double-quoted escapes — `\"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t`
 * and `\uXXXX` mean the same thing in both — and because it is one call that
 * cannot be got subtly wrong. What it leaves literal, the pass after it
 * escapes.
 *
 * There is no block or folded style here and there never will be: the `line`
 * and `choice` doors refuse a line break, so every value that reaches this
 * function is one line. A multi-line value that reached it anyway would still
 * come out correct — `\n` inside quotation marks — rather than reformatted.
 */
export function emitScalar(value: string): string {
  if (isPlainSafe(value)) {
    return value;
  }
  return JSON.stringify(value).replace(NEEDS_UNICODE_ESCAPE, unicodeEscape);
}
