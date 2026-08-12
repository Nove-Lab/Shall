import type { ConnectionLineComponentProps } from "@xyflow/react";
import { borderPointToward } from "./view/edge-geometry";

/**
 * The line that follows the hand while someone drags a new relation out of a
 * card.
 *
 * It is mandatory rather than decoration. The connect handle covers the whole
 * card, and the library computes a drag's origin as the handle's centre — which
 * for a full-card handle is the middle of the card, underneath the card itself.
 * The default connection line would therefore start invisibly and only appear
 * once the pointer had cleared the border. Starting it on the border facing the
 * pointer is what makes the gesture legible without drawing a dot to grab.
 *
 * The origin uses the same rule a settled relation uses, `borderPointToward`,
 * so the preview leaves the card exactly where the relation is about to and
 * nothing jumps on release. It is four-sided in both views: the far end is a
 * pointer rather than a card, so there is no column gap to route through and no
 * view rule to obey.
 *
 * `react-flow__connection-path` is the library's own class for exactly this
 * path, so the stroke is a stylesheet question — `spec.css` maps
 * `--xy-connectionline-stroke` onto a theme token like the rest of the canvas
 * chrome, and nothing about the colour is decided here.
 */
export function FloatingConnectionLine({
  fromNode,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  // A card declares its own `measured` box, so this is normally there before
  // the first drag can start. It stays a guard because the library's own type
  // says both numbers are optional: a node it has not measured yet has no box,
  // and a border point computed from a missing width would be drawn at the
  // card's own left edge without anything going wrong loudly.
  const { width, height } = fromNode.measured;
  if (width === undefined || height === undefined) {
    return null;
  }

  const from = borderPointToward(
    {
      x: fromNode.internals.positionAbsolute.x,
      y: fromNode.internals.positionAbsolute.y,
      width,
      height,
    },
    { x: toX, y: toY },
  );

  // `toX`/`toY` are the pointer, already converted into flow coordinates by the
  // library. Nothing is drawn at that end: the relation is not made yet, and a
  // dot there would read as an attachment point this canvas does not have.
  return (
    <path
      className="react-flow__connection-path"
      d={`M${from.x},${from.y} L${toX},${toY}`}
    />
  );
}
