import { TRPCError, initTRPC } from "@trpc/server";
import { z } from "zod";
import { isRefusal, type RefusalKind } from "../service/errors.js";
import {
  createProject,
  getProject,
  getProjectGitBranch,
  listRecentProjects,
  openProject,
  removeRecentProject,
} from "../service/projects.js";
import {
  readGlobalSettings,
  readProjectSettings,
  updateGlobalSettings,
  updateProjectSettings,
} from "../service/settings.js";
import {
  checkSpec,
  createSpecEdge,
  createSpecNode,
  listSpecEdges,
  listSpecNodes,
  removeSpecEdge,
  removeSpecNode,
  scaffoldSpecNode,
  updateSpecNode,
} from "../service/spec-graph.js";
import {
  approveSpecNode,
  commitSpec,
  readApprovedVersion,
  readSpecGitStatus,
  rejectSpecDeletion,
  restoreSpecNode,
  reviewSpec,
} from "../service/spec-review.js";

const t = initTRPC.create();

/**
 * A WorkLog's commits as the panel sends them. Optional on both node writes and
 * the same bargain as every other string here: shape only, and whether a sha or
 * a message is blank, or the type has any business carrying the list, is the
 * reader's sentence over the bytes about to land. Left out entirely, an update
 * carries the file's own list over — the spelling an older client speaks.
 */
const COMMITS = z.array(z.object({ sha: z.string(), message: z.string() }));

const STATUS_BY_KIND: Record<RefusalKind, TRPCError["code"]> = {
  invalid: "BAD_REQUEST",
  conflict: "CONFLICT",
  missing: "NOT_FOUND",
};

/**
 * A refusal from the service is something the person can fix — a blank field,
 * an arrow drawn backwards, an id already spoken for. Left alone it would leave
 * here as a 500, which says the daemon fell over and gives the screen nothing
 * to act on, so this is where a refusal picks up its status. It is the only
 * place that decides one, which is what lets the service stay clear of the
 * transport and still be understood by it.
 */
const procedure = t.procedure.use(async ({ next }) => {
  const result = await next();
  if (result.ok || !isRefusal(result.error.cause)) {
    return result;
  }

  const refusal = result.error.cause;
  throw new TRPCError({
    code: STATUS_BY_KIND[refusal.kind],
    message: refusal.message,
    cause: refusal,
  });
});

export const appRouter = t.router({
  projects: t.router({
    recent: procedure.query(() => listRecentProjects()),
    get: procedure
      .input(z.object({ id: z.string().min(1) }))
      .query(({ input }) => getProject(input.id)),
    // A live fact of the working tree, asked separately from the project
    // record it moves underneath — the header refetches it on focus, which is
    // the moment a person comes back from the terminal that changed it.
    gitBranch: procedure
      .input(z.object({ id: z.string().min(1) }))
      .query(({ input }) => getProjectGitBranch(input.id)),
    open: procedure
      .input(z.object({ path: z.string().min(1) }))
      .mutation(({ input }) => openProject(input.path)),
    create: procedure
      .input(z.object({ path: z.string().min(1) }))
      .mutation(({ input }) => createProject(input.path)),
    remove: procedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await removeRecentProject(input.id);
        return { ok: true as const };
      }),
  }),
  settings: t.router({
    global: procedure.query(() => readGlobalSettings()),
    updateGlobal: procedure
      .input(z.object({ port: z.number().int().min(1).max(65_535) }))
      .mutation(({ input }) => updateGlobalSettings(input)),
    project: procedure
      .input(z.object({ id: z.string().min(1) }))
      .query(({ input }) => readProjectSettings(input.id)),
    updateProject: procedure
      .input(z.object({ id: z.string().min(1), name: z.string().trim().min(1) }))
      .mutation(({ input }) => updateProjectSettings(input)),
  }),
  // The spec graph lives in the project's own `.shall/spec` folder, so every
  // call names the project it writes to. Which relations may exist is the canon
  // grammar's answer, and it is settled in the service on the way in — the
  // canvas decides what it offers, never what is allowed.
  //
  // These schemas ask only that a field be a string. Whether its text is usable
  // — blank, whitespace, untrimmed — is the service's to answer, because the
  // service already answers it and does so in words a person can read; asking
  // twice only meant the person got zod's issue array instead of the sentence
  // written for them.
  //
  // `body` is the same bargain writ large: it is the node's specification as
  // one free markdown document, and the only judgements over it — the
  // characters no text file can carry, the byte cap — are core's, served back
  // as sentences. Its shape is nobody's to check, because it has none.
  spec: t.router({
    nodes: procedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(({ input }) => listSpecNodes(input.projectId)),
    createNode: procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          type: z.string(),
          id: z.string(),
          shortName: z.string(),
          name: z.string(),
          body: z.string(),
          commits: COMMITS.optional(),
        }),
      )
      .mutation(({ input }) => createSpecNode(input)),
    updateNode: procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          id: z.string(),
          shortName: z.string(),
          name: z.string(),
          body: z.string(),
          commits: COMMITS.optional(),
        }),
      )
      .mutation(({ input }) => updateSpecNode(input)),
    removeNode: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .mutation(async ({ input }) => {
        await removeSpecNode(input);
        return { ok: true as const };
      }),
    edges: procedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(({ input }) => listSpecEdges(input.projectId)),
    createEdge: procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          type: z.string(),
          fromId: z.string(),
          toId: z.string(),
        }),
      )
      .mutation(({ input }) => createSpecEdge(input)),
    removeEdge: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .mutation(async ({ input }) => {
        await removeSpecEdge(input);
        return { ok: true as const };
      }),
    // The two procedures that name a PATH instead of a project, because they
    // answer for a folder nobody has opened yet: a fresh clone is in no
    // registry, and `shall check` and `shall add-spec-node` have to work in it
    // the moment it lands. The schemas ask only that the strings be strings —
    // whether anything is there, whether it is a Shall project, and whether
    // the type is one of the canon's are the service's sentences.
    check: procedure
      .input(z.object({ path: z.string().min(1) }))
      .query(({ input }) => checkSpec(input.path)),
    scaffold: procedure
      .input(z.object({ path: z.string().min(1), type: z.string() }))
      .mutation(({ input }) => scaffoldSpecNode(input)),
    // The review surface: colours computed on read, and the doors that
    // resolve them. `approve` is the one manufacturer of green, reached from
    // the web UI alone — the agents' contract is file-only by architecture,
    // and the guard is that convention plus the deny rule over the key; a
    // local token belongs here the day the daemon has a caller it does not
    // trust.
    review: procedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(({ input }) => reviewSpec(input.projectId)),
    approve: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .mutation(({ input }) => approveSpecNode(input)),
    rejectDeletion: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .mutation(({ input }) => rejectSpecDeletion(input)),
    approvedVersion: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .query(({ input }) => readApprovedVersion(input)),
    restoreNode: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .mutation(({ input }) => restoreSpecNode(input)),
    gitStatus: procedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(({ input }) => readSpecGitStatus(input.projectId)),
    commitSpec: procedure
      .input(z.object({ projectId: z.string().min(1), message: z.string() }))
      .mutation(({ input }) => commitSpec(input)),
  }),
});

export type AppRouter = typeof appRouter;
