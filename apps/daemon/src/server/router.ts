import { initTRPC } from "@trpc/server";
import { z } from "zod";
import {
  createProject,
  getProject,
  listRecentProjects,
  openProject,
  removeRecentProject,
} from "../core/projects.js";
import {
  readGlobalSettings,
  readProjectSettings,
  updateGlobalSettings,
  updateProjectSettings,
} from "../core/settings.js";

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
});

export type AppRouter = typeof appRouter;
