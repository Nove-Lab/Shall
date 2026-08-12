import { initTRPC } from "@trpc/server";
import { z } from "zod";
import {
  createProject,
  getProject,
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
  createSpecNode,
  listSpecNodes,
  removeSpecNode,
  updateSpecNode,
} from "../service/spec-graph.js";

const t = initTRPC.create();

export const appRouter = t.router({
  projects: t.router({
    recent: t.procedure.query(() => listRecentProjects()),
    get: t.procedure
      .input(z.object({ id: z.string().min(1) }))
      .query(({ input }) => getProject(input.id)),
    open: t.procedure
      .input(z.object({ path: z.string().min(1) }))
      .mutation(({ input }) => openProject(input.path)),
    create: t.procedure
      .input(z.object({ path: z.string().min(1) }))
      .mutation(({ input }) => createProject(input.path)),
    remove: t.procedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await removeRecentProject(input.id);
        return { ok: true as const };
      }),
  }),
  settings: t.router({
    global: t.procedure.query(() => readGlobalSettings()),
    updateGlobal: t.procedure
      .input(z.object({ port: z.number().int().min(1).max(65_535) }))
      .mutation(({ input }) => updateGlobalSettings(input)),
    project: t.procedure
      .input(z.object({ id: z.string().min(1) }))
      .query(({ input }) => readProjectSettings(input.id)),
    updateProject: t.procedure
      .input(z.object({ id: z.string().min(1), name: z.string().trim().min(1) }))
      .mutation(({ input }) => updateProjectSettings(input)),
  }),
  // The spec graph lives in the project's own shall.db, so every call names
  // the project it writes to. Edges are not here yet — nodes stand alone.
  spec: t.router({
    nodes: t.procedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(({ input }) => listSpecNodes(input.projectId)),
    createNode: t.procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          type: z.string().trim().min(1),
          attrs: z.string(),
        }),
      )
      .mutation(({ input }) => createSpecNode(input)),
    updateNode: t.procedure
      .input(
        z.object({
          projectId: z.string().min(1),
          id: z.string().min(1),
          type: z.string().trim().min(1),
          attrs: z.string(),
        }),
      )
      .mutation(({ input }) => updateSpecNode(input)),
    removeNode: t.procedure
      .input(z.object({ projectId: z.string().min(1), id: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await removeSpecNode(input);
        return { ok: true as const };
      }),
  }),
});

export type AppRouter = typeof appRouter;
