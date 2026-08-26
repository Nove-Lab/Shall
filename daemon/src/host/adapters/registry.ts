import type { AgentAdapter } from "./adapter.js";
import { AGENT_IDS, type AgentId } from "./ids.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";

/**
 * EVERY ADAPTER THERE IS, and the one policy every caller of them shares.
 *
 * THE POLICY: a project is wired for the UNION of what was asked for and what
 * is already there, and for Claude when that union is empty. Both halves are
 * deliberate.
 *
 * The union is why `shall init --agent codex` in a Claude project adds Codex
 * rather than replacing Claude: nothing a person types at `init` is an
 * instruction to unwire something, and removing a kit is not a thing Shall has
 * a door for. It is also why a hand-deleted `.claude` on a Claude-only project
 * COMES BACK on the next open — detection says the project is wired for
 * nothing, the fallback says Claude, and the kit is written again. That is the
 * behaviour a project that was always wired for Claude has always had, and it
 * is the reason the fallback is here rather than in the detection: `detect` is
 * a reading of the files and never a wish about them.
 *
 * The Claude fallback is what keeps every caller that never heard of an agent
 * choice — the web app's picker, an older client, a registry swept at start —
 * doing exactly what it did before there were two.
 */
export const AGENT_ADAPTERS: Readonly<Record<AgentId, AgentAdapter>> = {
  claude: claudeAdapter,
  codex: codexAdapter,
};

export function adapterOf(id: AgentId): AgentAdapter {
  return AGENT_ADAPTERS[id];
}

/**
 * Which agents this project is wired for, as the files stand — RAW, with no
 * fallback in it. An empty answer means nothing is wired, which is a different
 * fact from "wired for Claude" and is reported as itself.
 */
export async function detectWiredAgents(
  projectPath: string,
): Promise<AgentId[]> {
  const found = await Promise.all(
    AGENT_IDS.map(async (id) =>
      (await adapterOf(id).detect(projectPath)) ? id : null,
    ),
  );
  return found.filter((id): id is AgentId => id !== null);
}

/** The policy above, in one place: the union, and Claude when it is empty. */
export function agentsToWire(
  requested: readonly AgentId[],
  detected: readonly AgentId[],
): AgentId[] {
  const wanted = AGENT_IDS.filter(
    (id) => requested.includes(id) || detected.includes(id),
  );
  return wanted.length === 0 ? ["claude"] : [...wanted];
}
