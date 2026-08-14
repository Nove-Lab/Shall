import { type TRPCClient, createTRPCClient, httpBatchLink } from "@trpc/client";
// TYPE-ONLY, and deliberately so: the router's shapes cross into this process
// while none of its code does. A value import would pull the daemon — hono, zod,
// the whole of core — into a script whose entire job is to start a process and
// print what it says back, and would give this file a second copy of judgements
// that must have exactly one home. The web client is built the same way, from
// the same type, which is why the two clients cannot drift apart.
import type { AppRouter } from "@shall/daemon/router";

/**
 * The daemon, spoken to over the same tRPC surface the app in the browser uses.
 *
 * There is no second surface for the terminal: a command that could ask
 * something the screen cannot would eventually answer differently, and then
 * `shall check` and the panel would disagree about the same folder in front of
 * the same person.
 */
export function connect(url: string): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${url}/trpc` })],
  });
}
