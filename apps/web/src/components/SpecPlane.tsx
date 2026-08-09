import { useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type SpecView = "grid" | "graph";

function SpecCanvas({ view }: { view: SpecView }) {
  return (
    <div
      className={
        view === "grid" ? "spec__canvas spec__canvas--grid" : "spec__canvas"
      }
    >
      <ReactFlow
        nodes={[]}
        edges={[]}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={view === "grid"}
        panOnDrag={view === "graph"}
        zoomOnScroll={view === "graph"}
        minZoom={view === "grid" ? 1 : 0.18}
        maxZoom={view === "graph" ? 1.4 : 1}
        proOptions={{ hideAttribution: true }}
      >
        {view === "graph" ? (
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="#c9cbc5"
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}

export function SpecPlane() {
  const [view, setView] = useState<SpecView>("grid");

  return (
    <div className="spec">
      <div className="subbar">
        <span className="subbar__label">Spec Planes</span>
        <div className="segmented" role="group" aria-label="Spec view">
          {(["grid", "graph"] as const).map((which) => (
            <button
              key={which}
              className={
                view === which
                  ? "segmented__item segmented__item--active"
                  : "segmented__item"
              }
              type="button"
              onClick={() => setView(which)}
            >
              {which === "grid" ? "▦ grid" : "⁘ graph"}
            </button>
          ))}
        </div>
      </div>

      <div className="spec__body">
        <ReactFlowProvider>
          <SpecCanvas view={view} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
