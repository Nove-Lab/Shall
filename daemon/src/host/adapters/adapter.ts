import type { AgentId } from "./ids.js";

/**
 * WHAT AN AGENT ADAPTER OWES SHALL — four answers, and no state of its own.
 *
 * THE SPLIT BETWEEN `wire` AND `refresh` IS THE ONE THING TO GET RIGHT, and it
 * is not a performance bargain. `wire` is everything a create or an open runs:
 * generated prose, and the merges into files that are somebody else's — the
 * deny rules, the hook wiring, the block inside a person's `AGENTS.md`.
 * `refresh` is the subset the daemon sweeps every registered project with when
 * it starts, and that sweep deliberately touches only what Shall generates
 * whole. The reason is written out over `refreshRegisteredKits`: a merge into
 * somebody's settings file is something a person asked for by opening their
 * project, not something a daemon does to every path in a registry because it
 * happened to restart.
 *
 * `detect` IS RAW. It answers whether this agent is wired here — a file Shall
 * writes, carrying the marker Shall writes — and it never guesses, never falls
 * back and never wires anything. What is done with a project that detects as
 * nothing at all is the caller's policy, and it is stated once, in
 * `registry.ts`.
 *
 * NOTHING HERE THROWS. Every one of the four is an open-time convenience, for
 * the reason `agent-rules.ts` gives in full: a folder Shall may read and not
 * write into still opens, and still serves its graph.
 */
export interface AgentAdapter {
  readonly id: AgentId;
  /** What this agent calls itself — `AGENT_CHOICES`' own word for it. */
  readonly name: string;
  /** Whether this project is wired for this agent, as the files stand. */
  detect(projectPath: string): Promise<boolean>;
  /** Everything a create or an open runs, merges into other people's files included. */
  wire(projectPath: string): Promise<void>;
  /** The generated prose alone — what the daemon's start sweep may rewrite. */
  refresh(projectPath: string): Promise<void>;
}

/**
 * WHERE ONE AGENT'S GENERATED TREE COMES FROM AND WHERE IT LANDS — the whole of
 * what `writeKit` needs to know about an agent, so that the machinery next door
 * knows about none of them.
 *
 * `agents/dist/<agent>` IS THE ONE SOURCE EITHER WAY. A checkout walks that
 * folder; a single-binary Shall carries the same files under `embeddedPrefix`
 * and reads those. What is carried is what the walk would have found, which is
 * why the two sources share every line after them.
 */
export interface KitLayout {
  /** Which agent's kit this is — the folder under `agents/dist`. */
  readonly agent: AgentId;
  /** Where the carried copy sits, `"/"`-separated — see `host/embedded.ts`. */
  readonly embeddedPrefix: string;
  /** The generated tree in the checkout this daemon runs from. */
  root(): string;
  /** Every file of that tree, `"/"`-separated from its root, in walk order. */
  walk(root: string): Promise<string[]>;
  /**
   * Where one generated file lands in a project, or null when it is not a file
   * the project ever receives — an input to the hook wiring or to a managed
   * block is read by name and never copied.
   */
  targetOf(relative: string): string | null;
  /** The generated dialect, said in this project's grammar; identity where there is nothing to say. */
  transform(text: string): string;
  /** What an older kit wrote and this one no longer carries — marker-guarded. */
  removeStale(
    projectPath: string,
    written: ReadonlySet<string>,
  ): Promise<void>;
  /** The compile hook, merged into whichever file this agent reads it from. */
  wireHooks(projectPath: string): Promise<void>;
}
