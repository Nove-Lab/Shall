import { useEffect } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { describeAttrs, type SpecNode } from "./spec-node";

type SpecFlowNode = Node<{ node: SpecNode }, "spec">;

/**
 * A node has no stored position, so creation order is the layout: nodes fill
 * rows left to right. Dragging is off for the same reason — there is nowhere
 * to keep a position someone dragged a node to.
 */
const COLUMNS = 4;
const COLUMN_GAP = 232;
const ROW_GAP = 116;

function positionOf(index: number) {
  return {
    x: (index % COLUMNS) * COLUMN_GAP,
    y: Math.floor(index / COLUMNS) * ROW_GAP,
  };
}

/** The card is theme tokens only: same surface, border and type as a Card. */
function SpecNodeCard({ data, selected }: NodeProps<SpecFlowNode>) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground w-48 rounded-lg border px-3 py-2 shadow-xs transition-colors",
        selected
          ? "border-primary ring-ring/50 ring-3"
          : "hover:border-primary/40",
      )}
    >
      <p className="truncate text-sm font-medium">{data.node.type}</p>
      <p className="text-muted-foreground truncate text-xs">
        {describeAttrs(data.node.attrs)}
      </p>
    </div>
  );
}

const NODE_TYPES = { spec: SpecNodeCard };

interface SpecGraphProps {
  nodes: SpecNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SpecGraph({ nodes, selectedId, onSelect }: SpecGraphProps) {
  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<SpecFlowNode>([]);
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();

  useEffect(() => {
    setFlowNodes(
      nodes.map((node, index) => ({
        id: node.id,
        type: "spec" as const,
        position: positionOf(index),
        data: { node },
        selected: node.id === selectedId,
      })),
    );
  }, [nodes, selectedId, setFlowNodes]);

  // Adding or removing a node moves the graph's edge, so the viewport follows
  // it. Waiting for measurement keeps the fit off a node with no size yet.
  const count = nodes.length;
  useEffect(() => {
    if (initialized) {
      void fitView({ padding: 0.3, maxZoom: 1, duration: 200 });
    }
  }, [count, initialized, fitView]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={[]}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => onSelect(node.id)}
      nodesDraggable={false}
      nodesConnectable={false}
      minZoom={0.3}
      maxZoom={1.4}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
