import type { SpecEdge, SpecNode } from "@shall/core/graph";
import { isPermittedTriple, permittedEdgeTypes } from "@shall/core/graph";
import {
  deleteEdge,
  deleteNode,
  getNode,
  insertEdge,
  insertNode,
  listEdges,
  listNodes,
  updateNode,
} from "@shall/core/store";
import { ulid } from "ulid";
import { conflict, invalid, missing } from "./errors.js";
import { trimmedText, validateAttributes } from "./node-attributes.js";
import { requireRegistryProject } from "./projects.js";
import {
  getProjectDatabasePath,
  getProjectShallPath,
  pathExists,
} from "../host/project-files.js";

async function databaseFor(projectId: string): Promise<string> {
  const project = await requireRegistryProject(projectId);

  // The registry outlives the folder it points at — a project gets moved,
  // deleted, or checked out somewhere else and the entry stays behind. Saying
  // so here, in the words the picker uses, beats letting the sqlite driver
  // answer "unable to open database file" to someone who asked for a node.
  if (!(await pathExists(getProjectShallPath(project.path)))) {
    throw missing(`Not a Shall project: ${project.path}`);
  }
  return getProjectDatabasePath(project.path);
}

/**
 * A field of the node itself — its id, its type, the two names — every one of
 * which must carry something, so a blank one is refused by name instead of being
 * stored as an empty string a reader would have to interpret.
 *
 * The trim and the two characters sqlite would not hand back are
 * `trimmedText`'s, and are written down there: the attributes need the same
 * treatment without the same answer to emptiness, and one rule applied at one
 * door and forgotten at the next is the defect this repository already knows.
 */
function requireText(label: string, value: string): string {
  const trimmed = trimmedText(label, value);
  if (trimmed.length === 0) {
    throw invalid(`${label} is required.`);
  }
  // These fields are one line of identity each, and an id travels furthest —
  // into every edge that names it and every address that reaches it — so a
  // control character here is refused, as the previous system's ids were
  // hardened by a migration of their own. NUL never reaches this test;
  // `trimmedText` refuses it above with the more exact sentence.
  if (/\p{Cc}/u.test(trimmed)) {
    throw invalid(`${label} cannot contain a control character.`);
  }
  return trimmed;
}

export async function listSpecNodes(projectId: string): Promise<SpecNode[]> {
  return listNodes(await databaseFor(projectId));
}

/**
 * The id comes from the person. The client offers `nextIdSuggestion`, but they
 * may type over it, so this is the only place that can settle whether the thing
 * being written is a node the canon knows and an id nothing else has taken.
 *
 * The type is settled by the roster look-up rather than by a canon test of its
 * own: `validateAttributes` has to make it anyway — there is no roster to judge
 * a name against without it — and asking twice is how two sentences about one
 * fact come to disagree. It runs before the id is looked at because a node of no
 * type is not a node, whatever id it was given.
 */
export async function createSpecNode(input: {
  projectId: string;
  type: string;
  id: string;
  shortName: string;
  name: string;
  attributes: Record<string, string>;
}): Promise<SpecNode> {
  const type = requireText("A node type", input.type);
  const attributes = validateAttributes(type, input.attributes);

  const id = requireText("An id", input.id);
  const databasePath = await databaseFor(input.projectId);

  // The primary key would refuse a collision anyway, but it would refuse with a
  // constraint violation; the person needs to read which id is already spoken
  // for so they can pick the next one.
  const existing = await listNodes(databasePath);
  if (existing.some((node) => node.id === id)) {
    throw conflict(`${id} is already used by another node. Choose another id.`);
  }

  // One reading of the clock for both stamps, so a node arrives saying it was
  // last modified exactly when it was written rather than a millisecond later.
  const now = Date.now();
  const node: SpecNode = {
    id,
    type,
    shortName: requireText("A short name", input.shortName),
    name: requireText("A name", input.name),
    attributes,
    createdAt: now,
    updatedAt: now,
  };
  return insertNode(databasePath, node);
}

/**
 * id, type and createdAt are the node's identity, so an edit cannot reach them.
 * updatedAt it cannot reach either, but for the opposite reason: the edit is
 * what moves it, and the daemon is where the clock is.
 *
 * THE STORED NODE IS READ BEFORE ANYTHING IS JUDGED, because an edit names no
 * type and the attributes cannot be judged without one — `priority` is a real
 * column that a Requirement carries and a Term does not, and only the row knows
 * which of the two this id is. The read is also what turns a vanished id into a
 * sentence before a write is attempted rather than after.
 */
export async function updateSpecNode(input: {
  projectId: string;
  id: string;
  shortName: string;
  name: string;
  attributes: Record<string, string>;
}): Promise<SpecNode> {
  const id = requireText("An id", input.id);
  const databasePath = await databaseFor(input.projectId);

  const stored = await getNode(databasePath, id);
  if (!stored) {
    throw missing(`Unknown node: ${id}`);
  }

  // Attributes are judged before the names, because the create door judges
  // them first too — the same mistake should meet the same first sentence at
  // either door, and this door only had to wait for the read to learn the type.
  const attributes = validateAttributes(stored.type, input.attributes);
  const values = {
    shortName: requireText("A short name", input.shortName),
    name: requireText("A name", input.name),
    attributes,
  };

  const node = await updateNode(databasePath, id, values, Date.now());
  // Gone between the read and the write. The same sentence answers it, because
  // it is the same fact arriving a moment later.
  if (!node) {
    throw missing(`Unknown node: ${id}`);
  }
  return node;
}

export async function removeSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const id = requireText("An id", input.id);
  const removed = await deleteNode(await databaseFor(input.projectId), id);
  if (!removed) {
    throw missing(`Unknown node: ${id}`);
  }
}

export async function listSpecEdges(projectId: string): Promise<SpecEdge[]> {
  return listEdges(await databaseFor(projectId));
}

/**
 * What the canon allows between these two node types, said in the order a
 * person can use it: this direction first, because that is the arrow they just
 * drew and the set they can pick from without moving anything.
 *
 * The reverse clause is only worth adding when the arrow could actually be
 * turned around. Between two nodes of one type the reverse is the same
 * direction, so naming it sends the person off to redraw the arrow and meet the
 * identical refusal.
 */
function grammarHint(fromType: string, toType: string): string {
  const forward = permittedEdgeTypes(fromType, toType);
  const hint =
    forward.length > 0 ? ` This direction allows: ${forward.join(", ")}.` : "";

  if (fromType === toType) {
    return hint;
  }

  const reverse = permittedEdgeTypes(toType, fromType);
  return reverse.length > 0
    ? `${hint} The reverse direction allows: ${reverse.join(", ")}.`
    : hint;
}

/**
 * A relation the canon does not have is not a relation, so the grammar is
 * enforced here and not left to whatever the screen offered — the screen is a
 * convenience, this is the rule.
 *
 * A refusal names both node types and the edge type, because the person is
 * looking at two boxes and a line and cannot otherwise tell which of the three
 * was wrong, and it goes on to name the relations that would work: dragging
 * from the wrong end and reaching for a name from the wrong pair are the two
 * common mistakes, and neither fix should require reading a grammar table.
 */
export async function createSpecEdge(input: {
  projectId: string;
  type: string;
  fromId: string;
  toId: string;
}): Promise<SpecEdge> {
  const type = requireText("An edge type", input.type);
  const fromId = requireText("A source id", input.fromId);
  const toId = requireText("A target id", input.toId);
  const databasePath = await databaseFor(input.projectId);

  const nodes = await listNodes(databasePath);
  const from = nodes.find((node) => node.id === fromId);
  if (!from) {
    throw missing(`Unknown node: ${fromId}`);
  }
  const to = nodes.find((node) => node.id === toId);
  if (!to) {
    throw missing(`Unknown node: ${toId}`);
  }

  // The canon has self-loops, but between two nodes of one type — never from a
  // node to itself. Saying that plainly beats a grammar message that names the
  // same type twice and reads like a contradiction.
  if (fromId === toId) {
    throw invalid(`${fromId} cannot relate to itself.`);
  }

  if (!isPermittedTriple(from.type, to.type, type)) {
    throw invalid(
      `${type} is not allowed from ${from.type} to ${to.type}.${grammarHint(from.type, to.type)}`,
    );
  }

  // A second identical line is drawn on top of the first, so the canvas cannot
  // show that there are two, and no reading of the graph is helped by one.
  const edges = await listEdges(databasePath);
  if (
    edges.some(
      (edge) =>
        edge.type === type && edge.fromId === fromId && edge.toId === toId,
    )
  ) {
    throw conflict(`${fromId} already has a ${type} relation to ${toId}.`);
  }

  const edge: SpecEdge = {
    id: ulid(),
    type,
    fromId,
    toId,
    createdAt: Date.now(),
  };
  return insertEdge(databasePath, edge);
}

export async function removeSpecEdge(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const id = requireText("An id", input.id);
  const removed = await deleteEdge(await databaseFor(input.projectId), id);
  if (!removed) {
    throw missing(`Unknown edge: ${id}`);
  }
}
