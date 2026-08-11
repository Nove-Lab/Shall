import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LayoutGrid, Plus, Waypoints } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/project-context";
import { NodePanel, type NodePanelMode } from "./NodePanel";
import { SpecGraph } from "./SpecGraph";
import type { SpecNode, SpecNodeValues } from "./spec-node";
import "@/spec.css";

/** Closed, writing a new node, or sitting on one the graph already has. */
type PanelState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "view" | "edit"; id: string };

/**
 * A node the panel points at can be gone — someone deleted it, or the project
 * reloaded under it — and a pane with nothing to show closes instead.
 */
function detailMode(
  panel: PanelState,
  selected: SpecNode | null,
): NodePanelMode | null {
  if (panel.mode === "create") {
    return "create";
  }
  if (panel.mode === "closed" || !selected) {
    return null;
  }
  return panel.mode;
}

/**
 * The graph frame is the whole plane: no page title, because the plane row
 * already says where you are. Its toolbar picks the view and adds nodes, and
 * a node's detail pane docks inside the frame as a second resizable panel.
 */
export function SpecPlane() {
  const project = useProject();
  const [nodes, setNodes] = useState<SpecNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The graph is the only view that renders today; the toggle is the seat the
  // grid will take.
  const [view, setView] = useState<"graph" | "grid">("graph");
  const [panel, setPanel] = useState<PanelState>({ mode: "closed" });

  const load = useCallback(async () => {
    setNodes(await api.spec.nodes.query({ projectId: project.id }));
  }, [project.id]);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setPanel({ mode: "closed" });
    void load()
      .catch((error: unknown) =>
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not read the spec graph",
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const selected =
    panel.mode === "view" || panel.mode === "edit"
      ? (nodes.find((node) => node.id === panel.id) ?? null)
      : null;
  const mode = detailMode(panel, selected);

  async function submitNode(values: SpecNodeValues) {
    if (panel.mode === "edit") {
      const updated = await api.spec.updateNode.mutate({
        projectId: project.id,
        id: panel.id,
        ...values,
      });
      await load();
      setPanel({ mode: "view", id: updated.id });
      return;
    }

    const created = await api.spec.createNode.mutate({
      projectId: project.id,
      ...values,
    });
    await load();
    setPanel({ mode: "view", id: created.id });
  }

  async function deleteNode() {
    if (panel.mode !== "edit") {
      return;
    }

    await api.spec.removeNode.mutate({ projectId: project.id, id: panel.id });
    await load();
    setPanel({ mode: "closed" });
  }

  const overlay = loading ? null : loadError ? (
    <p className="text-destructive text-sm">{loadError}</p>
  ) : nodes.length === 0 ? (
    <EmptyState
      message="No spec nodes yet"
      hint="Add node puts the first one on the canvas"
    />
  ) : null;

  return (
    <main aria-label="Spec plane" className="flex min-h-0 flex-1 flex-col p-6">
      <div className="bg-card flex min-h-128 flex-1 flex-col overflow-hidden rounded-xl border">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
          <Tabs
            value={view}
            onValueChange={(value) =>
              setView(value === "grid" ? "grid" : "graph")
            }
          >
            <TabsList aria-label="Spec plane view">
              <TabsTrigger value="grid">
                <LayoutGrid />
                Grid view
              </TabsTrigger>
              <TabsTrigger value="graph">
                <Waypoints />
                Graph view
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            className="ml-auto"
            disabled={loading || loadError !== null}
            onClick={() => setPanel({ mode: "create" })}
          >
            <Plus />
            Add node
          </Button>
        </div>

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel id="spec-canvas" minSize={240}>
            <div className="spec-canvas relative size-full">
              <ReactFlowProvider>
                <SpecGraph
                  nodes={nodes}
                  selectedId={selected?.id ?? null}
                  onSelect={(id) => setPanel({ mode: "view", id })}
                />
              </ReactFlowProvider>
              {overlay ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {overlay}
                </div>
              ) : null}
            </div>
          </ResizablePanel>
          {mode ? (
            <>
              {/* `withHandle` is the grip: the border moves, and without one
                  nothing says so until a cursor happens to cross it. */}
              <ResizableHandle withHandle aria-label="Resize the node panel" />
              <ResizablePanel
                id="spec-detail"
                defaultSize={340}
                minSize={280}
                maxSize={520}
              >
                <NodePanel
                  mode={mode}
                  node={selected}
                  onClose={() => setPanel({ mode: "closed" })}
                  onEdit={() => {
                    if (selected) {
                      setPanel({ mode: "edit", id: selected.id });
                    }
                  }}
                  onCancelEdit={() => {
                    if (selected) {
                      setPanel({ mode: "view", id: selected.id });
                    }
                  }}
                  onSubmit={submitNode}
                  onDelete={deleteNode}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </main>
  );
}
