import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@shall/daemon/router";

export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
    }),
  ],
});

/** `root` is Shall's own `~/.shall`, which looks like a project but is not one. */
export type ShallFolderKind = "none" | "project" | "root";

export interface DirectoryEntry {
  name: string;
  path: string;
  shall: ShallFolderKind;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  shall: ShallFolderKind;
  directories: DirectoryEntry[];
}

export async function browse(path?: string): Promise<BrowseResult> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  const response = await fetch(`/api/fs/browse${query}`);
  if (!response.ok) {
    throw new Error("Could not browse this folder");
  }
  return (await response.json()) as BrowseResult;
}

export async function makeDirectory(
  parent: string,
  name: string,
): Promise<string> {
  const response = await fetch("/api/fs/mkdir", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parent, name }),
  });
  const body = (await response.json()) as { path?: string; error?: string };
  if (!response.ok || !body.path) {
    throw new Error(body.error || "Could not create folder");
  }
  return body.path;
}
