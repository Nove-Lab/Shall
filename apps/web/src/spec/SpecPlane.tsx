import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { EmptyState } from "@/components/EmptyState";
import "@/spec.css";

/**
 * The graph frame is the whole plane: no page title, because the plane row
 * already says where you are. A node's detail pane docks inside this frame as
 * a second resizable panel — there are no nodes to select yet.
 */
export function SpecPlane() {
  return (
    <main aria-label="Spec plane" className="flex min-h-0 flex-1 flex-col p-6">
      <ResizablePanelGroup
        orientation="horizontal"
        className="bg-card min-h-128 flex-1 rounded-xl border"
      >
        <ResizablePanel defaultSize="100">
          <div className="spec-canvas relative size-full">
            <ReactFlowProvider>
              <ReactFlow
                nodes={[]}
                edges={[]}
                nodesDraggable={false}
                nodesConnectable={false}
                minZoom={0.3}
                maxZoom={1.4}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                <Controls showInteractive={false} />
              </ReactFlow>
            </ReactFlowProvider>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <EmptyState
                message="No spec nodes yet"
                hint="Open a question or record a decision and it lands here"
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
