import { ReactFlowProvider } from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MetamodelGraph } from "./MetamodelGraph";

/**
 * THE CANON, ON DEMAND — what types there are, and what may point at what.
 *
 * IT IS A DIALOG AND NOT A PANE OF THE PLANE, because it is a reference a person
 * opens with a question and closes with an answer: it covers the board for a
 * moment rather than taking a share of it forever.
 *
 * IT HAS ITS OWN `ReactFlowProvider`. The plane's wraps the plane's graph, and
 * two flows sharing one store would share a viewport, a selection and a set of
 * node lookups — which is a picture that pans when you pan the other one.
 *
 * NOTHING IS REMEMBERED: not whether it was open, not where it was panned to.
 * The next open starts at the whole picture again, which is what a reference
 * should do.
 */
export function MetamodelDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {/* Wider than any other dialog on this surface, and deliberately: the
          board is 1 745 across and the point of it is reading the names. */}
      <DialogContent className="sm:max-w-[min(96rem,calc(100vw-4rem))]">
        <DialogHeader>
          <DialogTitle>Spec graph metamodel</DialogTitle>
          <DialogDescription>
            Every node type, and every relation allowed between them. Click a
            type to light what it touches.
          </DialogDescription>
        </DialogHeader>
        <ReactFlowProvider>
          <MetamodelGraph />
        </ReactFlowProvider>
      </DialogContent>
    </Dialog>
  );
}
