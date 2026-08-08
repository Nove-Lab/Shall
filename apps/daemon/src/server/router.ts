import { initTRPC } from "@trpc/server";
import { z } from "zod";
import {
  createProject,
  listRecentProjects,
  openProject,
  removeRecentProject,
} from "../core/projects.js";

const t = initTRPC.create();

export const appRouter = t.router({
  projects: t.router({
    recent: t.procedure.query(() => listRecentProjects()),
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
});

export type AppRouter = typeof appRouter;
