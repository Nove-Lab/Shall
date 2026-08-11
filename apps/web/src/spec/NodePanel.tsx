import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Trash2, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  attrsProblem,
  EMPTY_ATTRS,
  formatAttrs,
  formatCreatedAt,
  type SpecNode,
  type SpecNodeValues,
} from "./spec-node";

export type NodePanelMode = "create" | "view" | "edit";

const TITLE: Record<NodePanelMode, string> = {
  create: "New node",
  view: "Node details",
  edit: "Edit node",
};

/** A column the panel shows but nothing in it can change. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

interface NodePanelProps {
  mode: NodePanelMode;
  /** Null only while creating — there is no row yet. */
  node: SpecNode | null;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: SpecNodeValues) => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * The node inspector: one docked pane for all three states, because a node
 * being written, read and rewritten is the same four columns each time.
 */
export function NodePanel({
  mode,
  node,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
  onDelete,
}: NodePanelProps) {
  const [type, setType] = useState("");
  const [attrs, setAttrs] = useState(EMPTY_ATTRS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Only a different node or a different mode refills the form. A reload while
  // someone is typing must not overwrite what they have typed.
  const nodeId = node?.id ?? null;
  useEffect(() => {
    setError(null);
    setBusy(false);
    setType(node?.type ?? "");
    setAttrs(node ? formatAttrs(node.attrs) : EMPTY_ATTRS);
  }, [mode, nodeId]);

  const problem = attrsProblem(attrs);
  const canSave = type.trim() !== "" && problem === null;

  async function save() {
    if (!canSave || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({ type: type.trim(), attrs });
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
            <Field label="Attributes">
              <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs">
                {formatAttrs(node.attrs)}
              </pre>
            </Field>
            <Field label="ID">
              <span className="font-mono text-xs break-all">{node.id}</span>
            </Field>
            <Field label="Created">
              <span className="text-sm">{formatCreatedAt(node.createdAt)}</span>
            </Field>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="node-type">Type</Label>
              <Input
                id="node-type"
                autoFocus
                value={type}
                placeholder="requirement"
                onChange={(event) => setType(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void save();
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                The <span className="font-mono">type</span> column. Any label —
                the graph does not constrain it yet.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="node-attrs">Attributes</Label>
              <Textarea
                id="node-attrs"
                rows={10}
                spellCheck={false}
                className="min-h-40 font-mono text-xs"
                value={attrs}
                onChange={(event) => setAttrs(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                The <span className="font-mono">attrs</span> column. A JSON
                object, stored as one line.
              </p>
              {problem ? (
                <p className="text-destructive text-xs">{problem}</p>
              ) : null}
            </div>

            {node ? (
              <>
                <Field label="ID">
                  <span className="font-mono text-xs break-all">{node.id}</span>
                </Field>
                <Field label="Created">
                  <span className="text-sm">
                    {formatCreatedAt(node.createdAt)}
                  </span>
                </Field>
              </>
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
            <DialogDescription>
              <span className="font-medium">{node?.type}</span> and its
              attributes leave the graph. This cannot be undone.
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
