import { TRPCError, initTRPC } from "@trpc/server";
import { z } from "zod";
import { isRefusal, type RefusalKind } from "../service/errors.js";
import { taskBoard } from "../service/spec-board.js";
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
import { activityFeed, logActivity } from "../service/spec-activity.js";
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
  acceptSpecClosure,
  approveSpecNodes,
  leaveSpecOpen,
  rejectSpecNode,
  reviewQueue,
  withdrawSpecRejection,
} from "../service/spec-queue.js";
import {
  approveSpecNode,
  commitSpec,
  readApprovedVersion,
  readSpecGitStatus,
  rejectSpecDeletion,
  restoreSpecNode,
  reviewSpec,
} from "../service/spec-review.js";
import { boardAt, statusSpec } from "../service/spec-status.js";

const t = initTRPC.create();

/**
 * A WorkLog's commit shas as the panel sends them. Optional on both node writes
 * and the same bargain as every other string here: shape only, and whether a
 * sha is blank, or the type has any business carrying the list, is the reader's
 * sentence over the bytes about to land. Left out entirely, an update carries
 * the file's own list over — the spelling an older client speaks.
 */
const COMMITS = z.array(z.string());

/**
 * A Finding's hint list, on the same terms. Nothing resolves these ids — a
 * dangling one is not a fault and an empty list is not a fault — so shape is
 * the whole of what can be asked here, and whether the type may carry the key
 * at all is the reader's sentence over the bytes. `blocking` beside it is a
 * bare boolean for the same reason.
 */
const RELATED_NODES = z.array(z.string());

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
          blocking: z.boolean().optional(),
          relatedNodes: RELATED_NODES.optional(),
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
          blocking: z.boolean().optional(),
          relatedNodes: RELATED_NODES.optional(),
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
    // The five procedures that name a PATH instead of a project, because they
    // answer for a folder nobody has opened yet: a fresh clone is in no
    // registry, and `shall check`, `shall status`, `shall board`,
    // `shall add-spec-node` and `shall log` have to work in it the moment it
    // lands. The schemas ask only that the strings be strings — whether
    // anything is there, whether it is a Shall project, and whether the type
    // or the kind is one of the canon's are the service's sentences.
    //
    // THE PATH IS THE CALLER'S CWD AND NOT THE DAEMON'S, which is what
    // `scope` is resolved against: one daemon serves every checkout on the
    // machine, and it stands in none of them.
    //
    // `scope` is `.optional()` rather than `.default([])` because the default
    // is already written down: an empty list is the whole spec, and
    // `checkSpec` and `statusSpec` say so in their own signatures. A
    // `.default([])` here would spell that same fact a second time, in a place
    // neither service reads — so the day somebody moved the default, one of the
    // two spellings would be a lie and the schema's would be the one that won.
    check: procedure
      .input(
        z.object({
          path: z.string().min(1),
          scope: z.array(z.string()).optional(),
        }),
      )
      .query(({ input }) => checkSpec(input.path, input.scope)),
    status: procedure
      .input(
        z.object({
          path: z.string().min(1),
          scope: z.array(z.string()).optional(),
        }),
      )
      .query(({ input }) => statusSpec(input.path, input.scope)),
    // No scope: the board is an ordering of the whole project — what is ready
    // depends on chains that run through every band — so a narrowed one would
    // be a different question with the same name.
    board: procedure
      .input(z.object({ path: z.string().min(1) }))
      .query(({ input }) => boardAt(input.path)),
    scaffold: procedure
      .input(z.object({ path: z.string().min(1), type: z.string() }))
      .mutation(({ input }) => scaffoldSpecNode(input)),
    // The fifth of them, and the one write an agent is meant to ask for: at
    // the end of a run, one line of the activity feed — what finished, and
    // what it finished. Shape only here: which four kinds this door takes and
    // what a summary may hold are the service's sentences. It answers yes or
    // no and hands nothing back, because no procedure hands the feed to an
    // agent — the reader below is the web's.
    log: procedure
      .input(
        z.object({
          path: z.string().min(1),
          kind: z.string(),
          summary: z.string(),
          refs: z.array(z.string()).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await logActivity(input);
        return { ok: true as const };
      }),
    // The review surface: colours computed on read, and the doors that
    // resolve them. `approve` is the one manufacturer of green — it writes a
    // record into the approval ledger and nothing into the node's file — and
    // it is reached from the web UI alone: the agents' contract is file-only
    // by architecture, and the guard is that convention plus the deny rule
    // over the ledger; a local token belongs here the day the daemon has a
    // caller it does not trust.
    //
    // The review queue's own doors sit beside them and are the same kind of
    // thing said three ways. `reviewQueue` computes the bundles on every ask
    // and stores nothing. `reject` and `withdrawRejection` are the second book
    // — a person says in writing what is wrong, and takes it back.
    // `acceptClosure` and `leaveOpen` are the third — a subject (criterion or
    // task) closed over everything that claims it, or left open with a
    // reason; each removes the other book's word in the same act.
    // `approveNodes` is [Approve all]: one bundle, one turn, all or nothing.
    // Every one of them is the person's, never an agent's, for the reason
    // above.
    //
    // `ids` is an array of strings and the schema asks nothing more of it
    // than that, which is the same bargain every field here makes: whether an
    // id is blank, unknown or the wrong type of node is the service's
    // sentence, written for a person to read.
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
    taskBoard: procedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(({ input }) => taskBoard(input.projectId)),
    reviewQueue: procedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(({ input }) => reviewQueue(input.projectId)),
    // The activity feed's one reader, and it is the web's alone — there is no
    // CLI that prints it, by design. The months are the files that exist,
    // newest first; a month left out is the newest of them, and a month
    // outside the list is the service's refusal, not an empty answer.
    activity: procedure
      .input(
        z.object({ projectId: z.string().min(1), month: z.string().optional() }),
      )
      .query(({ input }) => activityFeed(input)),
    reject: procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          id: z.string(),
          rationale: z.string(),
        }),
      )
      .mutation(({ input }) => rejectSpecNode(input)),
    withdrawRejection: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .mutation(({ input }) => withdrawSpecRejection(input)),
    approveNodes: procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          ids: z.array(z.string()),
        }),
      )
      .mutation(({ input }) => approveSpecNodes(input)),
    acceptClosure: procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string() }))
      .mutation(({ input }) => acceptSpecClosure(input)),
    leaveOpen: procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          id: z.string(),
          rationale: z.string(),
        }),
      )
      .mutation(({ input }) => leaveSpecOpen(input)),
  }),
});

export type AppRouter = typeof appRouter;
