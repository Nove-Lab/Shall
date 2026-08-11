import { ulid } from "ulid";
import { requireRegistryProject } from "./projects.js";
import type { SpecNode } from "./types.js";
import {
  deleteNode,
  insertNode,
  listNodes,
  updateNode,
} from "../store/graph.js";
import { getProjectDatabasePath } from "../store/project-files.js";

/**
 * `attrs` is a JSON object living in a text column. Parsing and re-printing it
 * means one node's bytes do not depend on how the JSON was typed in.
 */
function normalizeAttrs(attrs: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(attrs);
  } catch {
    throw new Error("Attributes must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Attributes must be a JSON object.");
  }
  return JSON.stringify(parsed);
}

async function databaseFor(projectId: string): Promise<string> {
  const project = await requireRegistryProject(projectId);
  return getProjectDatabasePath(project.path);
}

export async function listSpecNodes(projectId: string): Promise<SpecNode[]> {
  return listNodes(await databaseFor(projectId));
}

export async function createSpecNode(input: {
  projectId: string;
  type: string;
  attrs: string;
}): Promise<SpecNode> {
  const node: SpecNode = {
    id: ulid(),
    type: input.type.trim(),
    attrs: normalizeAttrs(input.attrs),
    createdAt: Date.now(),
  };
  return insertNode(await databaseFor(input.projectId), node);
}

/** id and createdAt are the node's identity, so an edit cannot reach them. */
export async function updateSpecNode(input: {
  projectId: string;
  id: string;
  type: string;
  attrs: string;
}): Promise<SpecNode> {
  const values = {
    type: input.type.trim(),
    attrs: normalizeAttrs(input.attrs),
  };

  const node = await updateNode(
    await databaseFor(input.projectId),
    input.id,
    values,
  );
  if (!node) {
    throw new Error(`Unknown node: ${input.id}`);
  }
  return node;
}

export async function removeSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const removed = await deleteNode(
    await databaseFor(input.projectId),
    input.id,
  );
  if (!removed) {
    throw new Error(`Unknown node: ${input.id}`);
  }
}
