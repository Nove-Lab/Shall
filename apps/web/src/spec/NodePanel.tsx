import {
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Pencil, Trash2, X } from "lucide-react";
import {
  BAND_ORDER,
  attributesFor,
  bandOf,
  columnsInOrder,
  nextIdSuggestion,
  type AttributeDescriptor,
  type Band,
  type NodeTypeEntry,
  type SpecNode,
} from "@shall/core/graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatTimestamp } from "./spec-node";
import { displayedValue, unfilledRequired } from "./view/attributes";

export type NodePanelMode = "create" | "view" | "edit";

const TITLE: Record<NodePanelMode, string> = {
  create: "New node",
  view: "Node details",
  edit: "Edit node",
};

interface TypeGroup {
  band: Band;
  types: readonly NodeTypeEntry[];
}

/**
 * The twenty-three types as the canvas orders them: the four bands in band
 * order, each holding its own columns in canon order.
 *
 * Both facts are read off the canon rather than written here — `columnsInOrder`
 * is the very list the canvas lays its columns out from — so the dropdown and
 * the board cannot drift apart, and a type added to the roster appears in both
 * without an edit to either. Computed once at module scope, because the canon
 * does not change while the app runs.
 */
const TYPE_GROUPS: readonly TypeGroup[] = BAND_ORDER.map((band) => ({
  band,
  types: columnsInOrder().filter((entry) => bandOf(entry.name) === band),
}));

/** A row the panel shows but nothing in it can change. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

/**
 * ONE ATTRIBUTE'S CONTROL, AND THE KIND CHOOSES IT — `line` a one-line box,
 * `prose` a several-line one, `choice` the vocabulary as a dropdown. The kind is
 * not a styling hint: the database holds a CHECK per kind, so a control that
 * offered the wrong shape would be offering a save that cannot land.
 *
 * ENTER SAVES FROM A `line` AND NOT FROM A `prose`, for the reason the id box
 * has always saved on Enter and the body box never has: a return key inside
 * prose is a paragraph break somebody meant to type.
 *
 * ONLY AN OPTIONAL `choice` OFFERS "None". A dropdown is the one control a
 * person cannot empty by hand — there is no backspace in it — so without that
 * row an optional choice is a decision that can be made once and never unmade.
 * A required one has no such row because emptying it is not a state the type
 * allows, and offering it would be offering a save the door refuses.
 *
 * THE `""` ⇄ `null` CONVERSION IS THIS BOUNDARY'S. The draft holds strings and
 * only strings, because that is what the wire carries and what the roster's
 * other two kinds are; Base UI spells "nothing selected" as `null`. The two meet
 * here, in one expression each way, rather than putting a second empty value
 * into the draft for every reader downstream to know about.
 */
/**
 * A label's text and its required marker as ONE flex item — as two children
 * the Label's own `gap-2` would push the `*` half a rem off the word it marks.
 */
function RequiredLabel({ text }: { text: string }) {
  return (
    <span>
      {text}
      <span className="text-destructive"> *</span>
    </span>
  );
}

function AttributeField({
  descriptor,
  value,
  onChange,
  onEnter,
}: {
  descriptor: AttributeDescriptor;
  value: string;
  onChange: (value: string) => void;
  onEnter: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const controlId = `node-attribute-${descriptor.name}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={controlId}>
        {descriptor.required ? (
          <RequiredLabel text={descriptor.label} />
        ) : (
          descriptor.label
        )}
      </Label>
      {descriptor.kind === "choice" ? (
        <Select
          value={value === "" ? null : value}
          /* The vocabulary again, as data: it is what makes the trigger read
             `External System` rather than the `external_system` it stores.
             Without it Base UI has only the raw value to show. */
          items={descriptor.values ?? []}
          onValueChange={(next) => onChange(next ?? "")}
        >
          <SelectTrigger id={controlId} className="w-full">
            {/* The label above already names the field, so the placeholder says
                only that nothing has been picked — and says it without an
                article, which "Choose a Actor Type" would get wrong. */}
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {descriptor.required ? null : (
              <SelectItem value={null}>None</SelectItem>
            )}
            {(descriptor.values ?? []).map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : descriptor.kind === "prose" ? (
        <Textarea
          id={controlId}
          rows={6}
          className="text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={controlId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onEnter}
        />
      )}
      {descriptor.hint ? (
        <p className="text-muted-foreground text-xs">{descriptor.hint}</p>
      ) : null}
    </div>
  );
}

/**
 * What a save carries.
 *
 * `type` and `id` are the node's identity and only a create can choose them; an
 * edit sends the node's own back unchanged and the daemon ignores them, so both
 * modes hand the caller one shape rather than two.
 *
 * `attributes` IS THE DRAFT AS IT STANDS, keyed by column name, and it may hold
 * columns the type on screen does not carry — see the re-aim effect for why it
 * is allowed to. Narrowing it to the type's roster is `attributesToSend`'s job
 * and the caller's, one step before the wire.
 */
export interface NodeDraft {
  type: string;
  id: string;
  shortName: string;
  name: string;
  attributes: Record<string, string>;
}

interface NodePanelProps {
  mode: NodePanelMode;
  /** Null only while creating — there is no row yet. */
  node: SpecNode | null;
  /** Every node in the project: the id suggestion and its uniqueness check read this. */
  nodes: SpecNode[];
  /** The column the canvas was pointing at, when the request came from the canvas. */
  presetType?: string;
  /** Which create request this is — see the re-aim effect below. */
  request: number;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (draft: NodeDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * The node inspector: one docked pane for all three states, because a node
 * being written, read and rewritten is the same form each time — the four
 * identity fields, and under them whatever the chosen type carries.
 */
export function NodePanel({
  mode,
  node,
  nodes,
  presetType,
  request,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
  onDelete,
}: NodePanelProps) {
  const [type, setType] = useState("");
  const [id, setId] = useState("");
  const [shortName, setShortName] = useState("");
  const [name, setName] = useState("");
  /**
   * EVERY ATTRIBUTE OF EVERY TYPE IN ONE MAP, keyed by the column name the wire
   * uses. Not a `useState` per attribute: which attributes exist is the chosen
   * type's answer and it changes while the form stands open, and hooks cannot be
   * called conditionally. Not a map per type either — the whole point of keying
   * by column is that `statement` typed under one type is the same `statement`
   * under the next one that carries it.
   */
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  /**
   * Whether the id on screen is the person's own rather than the suggestion.
   * Once it is theirs it stays theirs until the form is refilled — including
   * when they clear the box, because someone deleting an id is about to type
   * one and having the suggestion reappear under their cursor is a fight.
   */
  const [idTouched, setIdTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const existingIds = nodes.map((existing) => existing.id);

  // Only a different node or a different mode refills the form; a repeat create
  // request re-aims the one already open instead, in the effect below. A reload
  // while someone is typing must not overwrite what they have typed, which is
  // why `node` and `nodes` are read in here and deliberately not depended on.
  const nodeId = node?.id ?? null;
  useEffect(() => {
    setError(null);
    setBusy(false);
    setConfirmingDelete(false);
    setIdTouched(false);

    if (node) {
      setType(node.type);
      setId(node.id);
      setShortName(node.shortName);
      setName(node.name);
      // The stored map holds the filled slots only, so an optional cell nobody
      // wrote is an absent key here and its control reads it as the empty box it
      // is. Nothing has to invent a `""` for it.
      setAttributes(node.attributes);
      return;
    }

    const startingType = presetType ?? "";
    setType(startingType);
    setId(nextIdSuggestion(startingType, existingIds));
    setShortName("");
    setName("");
    setAttributes({});
  }, [mode, nodeId]);

  /**
   * A SECOND "add node here" RE-AIMS THE FORM THAT IS ALREADY OPEN.
   *
   * `presetType` is read once, by the refill above, on the commit that opened
   * the form — and the form is never unmounted, so asking for a node in another
   * column while it stands open would otherwise leave it aimed at the column
   * asked for first. The counter is what makes the second ask a second ask.
   *
   * IT RE-AIMS AND IT DOES NOT CLEAR. Remounting on a `key` would say this in
   * one word and throw away a half-typed draft. What survives the move is
   * decided by the draft's own shape: it is keyed by COLUMN name, so a value
   * stays under the name it was typed against and reappears in the form
   * whenever the new type carries that column too — a `statement` written for a
   * Requirement is there for a Finding, because it is the same column and means
   * the same thing on both. A value whose column the new type does not carry
   * stays in the draft, out of sight, and is never sent: `attributesToSend`
   * names this type's roster and nothing else. So a change of type can leave a
   * field on screen behind, but it cannot smuggle one to the daemon. Only the
   * type moves, and the id with it under the same touch rule the dropdown uses.
   *
   * A REQUEST THAT NAMES NO TYPE LEAVES THE FIELD ALONE: the toolbar's Add node
   * has no column and therefore no opinion, and resetting the dropdown there
   * would discard a choice the person made by hand.
   */
  useEffect(() => {
    if (mode !== "create" || presetType === undefined) {
      return;
    }
    setType(presetType);
    if (!idTouched) {
      setId(nextIdSuggestion(presetType, existingIds));
    }
  }, [request]);

  /** The dropdown owns the id while the id is still a suggestion. */
  function chooseType(next: string) {
    setType(next);
    if (!idTouched) {
      setId(nextIdSuggestion(next, existingIds));
    }
  }

  /** One box's text into the draft, under the column name it belongs to. */
  function setAttribute(attribute: string, value: string) {
    setAttributes((current) => ({ ...current, [attribute]: value }));
  }

  /**
   * WHAT THE FORM ASKS FOR, DERIVED EVERY RENDER RATHER THAN STORED.
   *
   * It is a function of the type in the dropdown — the roster is a compiled
   * import, so the answer is on hand the instant the type changes — and a copy
   * kept in state would be a second thing to move when the dropdown moves.
   * Empty covers the two cases that have no roster: no type chosen yet, and a
   * type outside the canon, which only a stored row from another version could
   * carry and which the write door refuses by name.
   */
  const descriptors = attributesFor(type) ?? [];

  const trimmedId = id.trim();

  /**
   * What is wrong with the id, said while they type rather than after a round
   * trip. The daemon checks the same two things and its refusal is the
   * authority — this is here so a save that could only be refused is not
   * offered, and its wording is its own so nobody has to keep two sentences in
   * step. If another session takes the id first, the daemon's refusal is what
   * arrives and what gets shown.
   */
  const idProblem =
    mode !== "create"
      ? null
      : trimmedId === ""
        ? "An id is required."
        : existingIds.includes(trimmedId)
          ? `${trimmedId} already belongs to a node in this project.`
          : null;

  /**
   * An empty box is only worth a sentence once somebody has emptied it —
   * "required" under a field nobody has reached yet is noise. A box with
   * something in it says its problem either way, including the problem nobody
   * typed: a reload can seat the very id the suggestion offered, and a button
   * that has gone quiet with no sentence beside it is the worst of both.
   */
  const showIdProblem = idProblem !== null && (idTouched || trimmedId !== "");

  // The four identity fields are required of every node, and the type decides
  // which of its own slots are required on top of them — a Term needs a
  // Definition, a Question needs a State. The daemon refuses a blank one by
  // name and its emptiness rule is the one `unfilledRequired` runs, so the
  // button is off exactly when a save would be refused. An optional slot left
  // empty is not missing, it is empty, and it holds nothing up.
  const canSave =
    type.trim() !== "" &&
    trimmedId !== "" &&
    shortName.trim() !== "" &&
    name.trim() !== "" &&
    unfilledRequired(descriptors, attributes).length === 0 &&
    idProblem === null;

  async function save() {
    if (!canSave || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Trimmed on the way out because the daemon trims before it stores: what
      // is sent is then what lands, and the panel is not showing one string
      // while the table holds another. The attributes are handed over whole and
      // trimmed one step later, where they are also narrowed to the type's own
      // roster — see `attributesToSend`.
      await onSubmit({
        type: type.trim(),
        id: trimmedId,
        shortName: shortName.trim(),
        name: name.trim(),
        attributes,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the node",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the node",
      );
    } finally {
      setConfirmingDelete(false);
      setBusy(false);
    }
  }

  /** Enter saves from a one-line field. A prose box keeps its newlines. */
  function saveOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  // Deliberately not a <form>: React reuses one <button> element across the
  // three footers, so a submit button appearing under a click that landed on
  // Edit would submit the form the click was never meant to touch.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="truncate text-sm font-medium">{TITLE[mode]}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "view" && node ? (
          <div className="grid gap-4">
            <Field label="Type">
              <Badge variant="secondary">{node.type}</Badge>
            </Field>
            <Field label="ID">
              <span className="font-mono text-xs break-all">{node.id}</span>
            </Field>
            <Field label="Short name">
              <span className="text-sm">{node.shortName}</span>
            </Field>
            <Field label="Name">
              <span className="text-sm">{node.name}</span>
            </Field>
            {/* THE ROSTER IS THE READING ORDER, not the map's. `attributes` is
                a plain object and its keys arrive in whatever order the daemon
                built them; the roster is the order the type was authored in and
                the order the form stacked its boxes in, so a node reads the way
                it was written.

                AN EMPTY OPTIONAL SLOT IS SHOWN AND NOT SKIPPED. A row that
                disappears when it is empty makes a person wonder whether the
                type has it at all; the dash says "this type carries a
                Benchmark, and this node has none", which is the answer they
                came for. It cannot be a required slot: the door refuses those
                empty, so a blank one here would be a row the database does not
                hold. */}
            {(attributesFor(node.type) ?? []).map((descriptor) => {
              const value = node.attributes[descriptor.name];
              return (
                <Field key={descriptor.name} label={descriptor.label}>
                  {value === undefined ? (
                    <span className="text-muted-foreground text-sm">—</span>
                  ) : descriptor.kind === "prose" ? (
                    /* Prose is what somebody wrote in a box with a return key,
                       so the breaks they put in it are part of what they
                       wrote. */
                    <p className="text-sm whitespace-pre-wrap">{value}</p>
                  ) : (
                    /* A choice reads as its English label; a line as itself. */
                    <span className="text-sm">
                      {displayedValue(descriptor, value)}
                    </span>
                  )}
                </Field>
              );
            })}
            {/* UPDATED IS METADATA AND NOT AN ATTRIBUTE, which is worth
                recording because the rows above it are exactly what the type
                carries. The daemon sets it and no form offers it — the create
                form is exactly what was asked for — so it is shown for the same
                reason a file's date is shown beside its name. It is the
                modified instant
                and not the created one for that same reason: what a person
                wants from a date beside a document is how current what they are
                reading is, and on a node that has been edited the creation
                instant answers a different question. A node nobody has edited
                shows the instant it was written, which is the true answer. */}
            <Field label="Updated">
              <span className="text-sm">{formatTimestamp(node.updatedAt)}</span>
            </Field>
          </div>
        ) : (
          <div className="grid gap-4">
            {mode === "edit" && node ? (
              /* Type and id are settled at create: the id is what every edge
                 names, and the type is what decides which edges are grammatical
                 at all. The daemon refuses to move either, so a form offering
                 them would be lying about what a save can do. */
              <>
                <Field label="Type">
                  <Badge variant="secondary">{node.type}</Badge>
                </Field>
                <Field label="ID">
                  <span className="font-mono text-xs break-all">{node.id}</span>
                </Field>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="node-type">
                    <RequiredLabel text="Type" />
                  </Label>
                  <Select
                    value={type}
                    onValueChange={(value) => chooseType(value ?? "")}
                  >
                    {/* No type is preselected: a dropdown showing Term on open
                        would answer a question nobody was asked. */}
                    <SelectTrigger id="node-type" autoFocus className="w-full">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    {/* Item-aligned positioning would hang a twenty-three row
                        list off the chosen row; in a docked panel this many
                        rows only fit as a plain drop below the trigger. */}
                    <SelectContent alignItemWithTrigger={false}>
                      {TYPE_GROUPS.map((group) => (
                        <SelectGroup key={group.band}>
                          <SelectLabel>{group.band}</SelectLabel>
                          {group.types.map((entry) => (
                            <SelectItem key={entry.name} value={entry.name}>
                              {entry.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="node-id">
                    <RequiredLabel text="ID" />
                  </Label>
                  <Input
                    id="node-id"
                    className="font-mono"
                    spellCheck={false}
                    value={id}
                    aria-invalid={showIdProblem}
                    onChange={(event) => {
                      setIdTouched(true);
                      setId(event.target.value);
                    }}
                    onKeyDown={saveOnEnter}
                  />
                  <p className="text-muted-foreground text-xs">
                    Suggested from the type. Type over it for an id of your own.
                  </p>
                  {showIdProblem ? (
                    <p className="text-destructive text-xs">{idProblem}</p>
                  ) : null}
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="node-short-name">
                <RequiredLabel text="Short name" />
              </Label>
              <Input
                id="node-short-name"
                autoFocus={mode === "edit"}
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
                onKeyDown={saveOnEnter}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="node-name">
                <RequiredLabel text="Name" />
              </Label>
              <Input
                id="node-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={saveOnEnter}
              />
            </div>

            {/* THE TYPE'S OWN FIELDS, IN THE ORDER ITS ROSTER AUTHORS THEM, and
                the same list in create and in edit — an edit cannot move the
                type, so the two forms are asking for the same thing. Before a
                type is chosen there are none of them, which is the honest shape
                for "which fields" being a question the type answers. */}
            {descriptors.map((descriptor) => (
              <AttributeField
                key={descriptor.name}
                descriptor={descriptor}
                value={attributes[descriptor.name] ?? ""}
                onChange={(value) => setAttribute(descriptor.name, value)}
                onEnter={saveOnEnter}
              />
            ))}

            {mode === "edit" && node ? (
              <Field label="Updated">
                <span className="text-sm">
                  {formatTimestamp(node.updatedAt)}
                </span>
              </Field>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="text-destructive mt-4 text-sm">{error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t p-3">
        {mode === "view" ? (
          <Button type="button" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
        ) : mode === "create" ? (
          <>
            <Button
              type="button"
              disabled={!canSave || busy}
              onClick={() => void save()}
            >
              {busy ? "Adding…" : "Add node"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={!canSave || busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="ml-auto"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 />
              Delete
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this node?</DialogTitle>
            {/* The cascade is named because it is the part that is not on
                screen: the card goes, and so does every relation drawn to it. */}
            <DialogDescription>
              <span className="font-medium">{node?.id}</span> and every relation
              that touches it leave the graph. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete node"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
