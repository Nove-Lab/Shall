/**
 * WHICH AGENTS SHALL CAN WIRE A PROJECT FOR, and the words a person is offered
 * when they are asked to choose one.
 *
 * IT IMPORTS NOTHING, AND THAT IS THE WHOLE DESIGN. The CLI has to name the
 * choices before it has started a daemon — a `--agent` nobody recognises is
 * refused with no knock at all — and the terminal's picker is drawn from the
 * same rows the daemon wires from. A second list of agent names in the client
 * would be the first thing to go stale, so this file is exported from the
 * daemon package as `@shall/daemon/agents` and holds no code that would drag
 * the router, zod or the host into a process that only wanted two names.
 *
 * A ROW IS ALL FOUR ANSWERS AT ONCE. `name` is what a person is shown, `hint`
 * is the tail of `shall init`'s closing line — how this agent is actually run
 * in the folder that was just wired — and `notice` is the one thing Shall knows
 * about this agent that a person will otherwise discover as a failure. Adding
 * an agent means adding a row here and an adapter beside it, and nothing else
 * has a list to be added to.
 */

/** The agents Shall wires a project for. */
export type AgentId = "claude" | "codex";

/**
 * Every one of them, in the order they are offered and in the order a wired set
 * is said. Claude is first because it is the one Shall drove first and the one
 * a project gets when nobody chose.
 */
export const AGENT_IDS = ["claude", "codex"] as const satisfies readonly AgentId[];

/** One agent as a person meets it: the name, the way in, and the warning. */
export interface AgentChoice {
  readonly id: AgentId;
  /** What the agent calls itself — what a picker row and a wired list say. */
  readonly name: string;
  /** The tail of `Or ask your agent:` — how this agent is run, here, now. */
  readonly hint: string;
  /**
   * One line printed on stderr after this agent is wired, or null when there is
   * nothing a person has to know. It is not advice: it is a measured fact about
   * what will otherwise go wrong.
   */
  readonly notice: string | null;
}

export const AGENT_CHOICES: readonly AgentChoice[] = [
  {
    id: "claude",
    name: "Claude Code",
    hint: "run claude here, then /shall.help",
    notice: null,
  },
  {
    id: "codex",
    name: "Codex",
    hint: "run codex here, then use the $shall:help skill",
    // MEASURED, NOT FEARED. Codex's default sandbox is workspace-write, and
    // every `shall` call is a loopback connection to the daemon — which that
    // sandbox refuses. A person who is not told this meets it as the first act
    // of the first process they run, reported as a CLI that will not start.
    notice:
      "Codex's default sandbox blocks the daemon at localhost — approve shall's commands when Codex asks, or add an execpolicy allow rule, or Shall's processes cannot read this project.",
  },
];

/** The row for an id, for a caller that already knows the id is one of ours. */
export function choiceOf(id: AgentId): AgentChoice {
  const found = AGENT_CHOICES.find((choice) => choice.id === id);
  if (found === undefined) {
    throw new Error(`No agent choice for ${id}`);
  }
  return found;
}

/** Whether a word a person typed is one of the agents there are. */
export function isAgentId(word: string): word is AgentId {
  return (AGENT_IDS as readonly string[]).includes(word);
}

/** The names of a set of agents, in the order above, for a sentence. */
export function agentNames(ids: readonly AgentId[]): string {
  return AGENT_IDS.filter((id) => ids.includes(id))
    .map((id) => choiceOf(id).name)
    .join(", ");
}
