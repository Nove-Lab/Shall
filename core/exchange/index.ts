/**
 * core/exchange — an empty module, and the reason it stays empty.
 *
 * A session broker was to stand here: export the graph as a base, take a draft
 * back, diff the two, run the gates, refuse a stale base, land what passed.
 * None of it was written and none of it is going to be. The spec is committed
 * markdown now, so git holds the history, the merge and the review that machine
 * existed to provide; an agent edits `.shall/spec/` directly and is judged by
 * the same reader the daemon serves from, which is what `shall check` reports.
 *
 * The folder is kept because the question it was answering is still a real one.
 * If an intermediary between an agent and the graph ever earns its place, this
 * is where it goes — and until then its emptiness is visible rather than
 * assumed.
 */
export {};
