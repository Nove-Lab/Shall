import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type {
  BandNodeData,
  CardNodeData,
  ColumnNodeData,
  LaneNodeData,
} from "./view/furniture";
import { GEOMETRY } from "./view/layout";

/**
 * The four things React Flow draws on the Spec canvas: a node's card, a type
 * column's header, a band's ground, and the ruled lane of empty slots under a
 * column header.
 *
 * ALL FOUR ARE REACT FLOW *NODES*, which is `view/furniture.ts`'s decision and
 * not this file's: the library positions them, culls them, pans and zooms them,
 * and none of that is reimplemented here. What is here is only how each one is
 * drawn.
 *
 * NO GEOMETRY IS INVENTED IN THIS FILE. Every box either arrives on `data` —
 * the layout measured it and declared the same number to the library — or is
 * read from `GEOMETRY`, whose whole reason for existing is that the reserved box
 * and the drawn box must be one number. A literal px here is a second home for a
 * number the layout already owns, and the two would drift on the first edit with
 * nothing to error.
 *
 * NO COLOUR IS INVENTED EITHER. Everything paints from theme tokens through
 * Tailwind utilities, so the canvas follows the theme the rest of the app
 * follows. `spec.css` maps React Flow's own CSS variables onto the same tokens
 * and is the only stylesheet involved.
 */

/**
 * A rule is one pixel, and a rule drawn inside a box the layout has already
 * measured has to be paid for out of that box.
 *
 * It is NOT in `GEOMETRY`. Nothing about where a card goes depends on it: the
 * band's rule is inside the band's own declared height and the lane's hairline
 * is inside a row's own pitch, so the layout never has to know. It is here
 * because two components draw a rule and then have to fit inside a number
 * somebody else chose, and one home beats two.
 */
const RULE = 1;

export type CardNode = Node<CardNodeData, "spec">;
export type ColumnNode = Node<ColumnNodeData, "column">;
export type BandNode = Node<BandNodeData, "band">;
export type LaneNode = Node<LaneNodeData, "lane">;
export type CanvasNode = CardNode | ColumnNode | BandNode | LaneNode;

/**
 * BOTH HANDLES COVER THE WHOLE CARD AND NEITHER IS VISIBLE. A relation may be
 * dragged out of anywhere on a card and dropped anywhere on a card; there is no
 * dot to aim at, and the affordance is the crosshair cursor the library puts on
 * a connectable handle plus the source handle's title.
 *
 * EVERY UTILITY HERE CARRIES `!` AND THAT IS NOT DEFENSIVENESS. React Flow's own
 * stylesheet sizes and positions `.react-flow__handle` — 6 x 6, `border-radius:
 * 100%`, `top: 50%` and a `transform: translate(±50%, -50%)` off the side it was
 * given. That sheet arrives unlayered, and unlayered normal declarations beat
 * anything in a cascade layer whatever its selector's specificity, while
 * Tailwind's utilities are all inside `@layer utilities`. Important declarations
 * invert that order, so `!` is the only thing that makes a utility here win.
 *
 * WHICH OF THEM ARE LOAD-BEARING, since a reader will otherwise assume all of
 * them are:
 *
 *   · `inset-0!`, `h-full!`, `w-full!` — the 6px dot becomes the card.
 *   · `transform-none!` — the vendor's `transform` would slide the card-sized
 *     box half its own width off the edge it is anchored to. `translate-0!` does
 *     NOT do this job: Tailwind writes the *individual* `translate` property,
 *     and the spec applies `translate` and `transform` both.
 *   · `rounded-none!` — hit-testing follows the border radius, so a `100%`
 *     radius would leave the card's four corners unable to start or receive a
 *     relation. This is the one that looks decorative and is not.
 *
 * `absolute!`, `border-0!` and `bg-transparent!` are belt: the vendor already
 * positions the handle absolutely, `box-sizing: border-box` keeps its 1px border
 * inside the box either way, and `opacity-0!` hides colour regardless. They are
 * kept because this string's job is to state the whole box rather than to
 * inherit the parts of it nobody has changed yet.
 *
 * PIXEL DIMENSIONS ARE NOT RESET AND DO NOT NEED TO BE. `min-width` and
 * `min-height` are 5px, and no card is smaller than that.
 *
 * `opacity-0!` and never `hidden`: an invisible element is still hit-tested, and
 * being hit is this element's entire purpose.
 *
 * WHAT "THE WHOLE CARD" LEAVES OUT, measured rather than assumed: an inset
 * resolves against the PADDING box, so both handles come back 146 x 42 inside a
 * 148 x 44 card and the card's own 1px border is a ring around them. It is left
 * that way because the ring cannot be reached without either an arbitrary
 * `calc()` size or dropping the border for a ring shadow, and because nothing
 * fails on it: a press there still bubbles to the node and selects it, and a
 * drop there still lands, through the library's nearest-handle search rather
 * than through `elementFromPoint`.
 */
const WHOLE_CARD_HANDLE =
  "absolute! inset-0! h-full! w-full! transform-none! rounded-none! border-0! bg-transparent! opacity-0!";

/**
 * ONE CARD: a 9 x 9 signal square and the node's id on the first line, its short
 * name on the second.
 *
 * IT IS SIZED FROM ITS DATA AND NEVER FROM CSS. The layout reserved a box for
 * this card and told the library the same numbers; drawing it at whatever its
 * content happened to need would leave the reserved box and the drawn box
 * disagreeing, which is a picture that is wrong with nothing to notice — cards
 * overlapping their lane's ruling, relations anchored a few pixels off the
 * border they appear to leave. `GEOMETRY.grid.cardHeight`'s 44 is exactly
 * `1 + 5 + 16 + 16 + 5 + 1`: two `text-xs` line boxes, `py-1.25` around them,
 * and the border. The padding is written as spacing rather than as an arbitrary
 * value so it stays on the same scale as everything else, but that sum is the
 * reason it is 1.25 and not 1.
 *
 * THE ORDER OF THE TWO HANDLES IS THE WHOLE TRICK, and it is subtle enough to be
 * worth stating rather than preserving by luck:
 *
 *   · The TARGET is rendered FIRST with `isConnectableStart={false}`. At rest
 *     the library grants `pointer-events: all` only to a handle it would let you
 *     START from, so this one is inert and the card is not two overlapping drop
 *     zones fighting over a press.
 *   · The SOURCE is rendered LAST with `isConnectableEnd={false}`. Last, so it
 *     is the element under the pointer at rest — both are `inset: 0`, so DOM
 *     order is what decides — and a press anywhere on the card begins a
 *     connection. Not an end, so the moment a drag is in progress the library
 *     stops granting it pointer events at all, and `document.elementFromPoint`
 *     over this card during someone else's drag returns the TARGET handle
 *     underneath it, which is how the drop is resolved (`isValidHandle` in
 *     `@xyflow/system`).
 *
 * Get either half wrong and the failure is silent and one-directional: swap the
 * order and no drag can start, drop `isConnectableEnd={false}` and no drag can
 * land.
 */
export function SpecNodeCard({ data }: NodeProps<CardNode>) {
  return (
    <div
      className={cn(
        // `relative` is declared rather than inherited: the handles are
        // `inset-0`, an inset resolves against the nearest positioned ancestor,
        // and without this that is React Flow's own node wrapper — the same box
        // today, and not the same guarantee.
        "bg-card text-card-foreground relative flex flex-col rounded-md border px-2 py-1.25 transition-colors",
        data.selected
          ? "border-primary ring-ring/50 ring-3"
          : "hover:border-primary/40",
      )}
      style={{ width: data.width, height: data.height }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        className={WHOLE_CARD_HANDLE}
      />
      <div className="flex items-center gap-1.5">
        {/* THE TRAFFIC LIGHT'S SEAT, AND THE COLOUR IS A PLACEHOLDER.
            Every card is green because nothing computes a signal yet: the
            arithmetic that would decide one lives in `core/arith` and is not
            written. The square is drawn anyway so the card's shape is settled
            and the seat is reserved at its real size, and it is drawn in ONE
            colour on purpose — a second colour is a verdict, and a verdict this
            tree cannot reach is worse than no square at all.

            The colour is Tailwind's own `emerald-500`, not a token invented
            here. A new token would be a design-system setting this feature
            made up, and the rule for this work is that nothing is made up —
            the theme itself reaches for the same palette the same way
            (`--primary: var(--color-blue-600)`). When the arithmetic lands and
            three states need naming, that is the moment a semantic token is
            earned; today it would name a verdict nothing computes. */}
        <span className="bg-emerald-500 size-2.25 shrink-0" />
        <span className="truncate font-mono text-xs">{data.node.id}</span>
      </div>
      <span className="text-muted-foreground truncate text-xs">
        {data.node.shortName}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        isConnectableEnd={false}
        className={WHOLE_CARD_HANDLE}
        title="drag to relate"
      />
    </div>
  );
}

/**
 * A TYPE'S COLUMN HEADER: its name, and how many nodes are under it.
 *
 * ITS HEIGHT IS `GEOMETRY.columnHeaderHeight` AND IS NOT LEFT TO THE CONTENT.
 * `grid.headerHeight` is literally `bandGap + this + rowGap`, so every card in
 * the grid is placed by this number; a header that drew one pixel taller than
 * the layout reserved would push its label into the clearance above the band's
 * first row, in every band, with nothing to error. Declaring it here is what
 * makes the drawn header and the reserved header the same header.
 *
 * The 21 it is set to is this block's own arithmetic read forwards: a `text-xs`
 * label is a 16px line box, `pb-1` is 4, the rule is 1. Change the label's size
 * and this component's height does not change — `GEOMETRY` does, and the grid
 * moves with it.
 *
 * The count is the only number on this canvas that is not a coordinate, so it is
 * set in the mono face to keep it from reading as part of the name.
 */
export function ColumnHeaderNode({ data }: NodeProps<ColumnNode>) {
  return (
    <div
      className="text-muted-foreground flex items-baseline justify-between gap-1.5 border-b pb-1 text-xs"
      style={{ width: data.width, height: GEOMETRY.columnHeaderHeight }}
    >
      {/* `min-w-0` is what lets a long type name end in an ellipsis instead of
          pushing its count out of the slot: a flex child's `min-width` is
          `auto`, which is its own content. */}
      <span className="min-w-0 truncate">{data.label}</span>
      <span className="shrink-0 font-mono">{data.count}</span>
    </div>
  );
}

/**
 * A BAND'S GROUND — the strip the cards of one zone sit on, with the zone's name
 * in the gutter to the left of the first column.
 *
 * The ground is a wash rather than a fill so the cards keep their own surface
 * against it, and the rule at the top is what separates two adjacent bands,
 * which are contiguous and otherwise identical.
 *
 * THE LABEL IS PLACED ON THE SAME LINE AS THE COLUMN HEADERS. Those sit at
 * `bandGap` below the band's top, and the band's own rule is inside the band's
 * declared height, so the padding above the label is `bandGap` less that rule.
 * It sits in the gutter — no column starts inside `bandGutter`, which is why
 * there is somewhere to put it at all.
 */
export function BandNodeBlock({ data }: NodeProps<BandNode>) {
  return (
    <div
      className="bg-muted/30 border-t"
      style={{ width: data.width, height: data.height }}
    >
      <span
        className="text-muted-foreground block truncate text-xs"
        style={{
          width: GEOMETRY.bandGutter,
          paddingTop: GEOMETRY.bandGap - RULE,
          paddingLeft: GEOMETRY.bandGap,
          paddingRight: GEOMETRY.bandGap,
        }}
      >
        {data.band}
      </span>
    </div>
  );
}

/**
 * THE EMPTY GRID, DRAWN: a ladder of hairlines one card wide, ruled at the foot
 * of each row slot, as many times as the band's cap allows.
 *
 * IT IS DELIBERATELY NOT A GRID OF OUTLINED BOXES. A box is a thing you click,
 * and there is nothing to click here — you author from the toolbar or from the
 * pane's own menu — so several hundred outlined cells on a large screen would
 * advertise several hundred affordances that do not exist. Ruled paper says
 * "rows go here" and promises nothing.
 *
 * AND IT MUST NEVER BE MISTAKEN FOR A CARD. No text, no signal square, no border
 * box, and `furniture.ts` hands it `pointerEvents: "none"` so a right-click on
 * an empty slot falls through to the pane rather than dying in a node lookup
 * with no graph id to find.
 *
 * The pitch and the card's height arrive on `data` because they live in
 * `GEOMETRY` and differ between the two views; `data.height` is the layout's own
 * number and is never recomputed here as `rows * rowPitch`, which would be a
 * second expression for the box the library was already told about.
 */
export function LaneRunBlock({ data }: NodeProps<LaneNode>) {
  const { cardHeight, rowPitch } = data;
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        // A gradient and not a repeated element: nothing to mount, nothing to
        // measure, and the line colour stays the theme's own `--border` rather
        // than a value copied out of it.
        backgroundImage:
          `repeating-linear-gradient(to bottom,` +
          ` transparent 0, transparent ${String(cardHeight)}px,` +
          ` var(--border) ${String(cardHeight)}px,` +
          ` var(--border) ${String(cardHeight + RULE)}px,` +
          ` transparent ${String(cardHeight + RULE)}px,` +
          ` transparent ${String(rowPitch)}px)`,
      }}
    />
  );
}

/**
 * Defined once, at module scope, because React Flow rebuilds its internals when
 * this object's identity changes — declared inside a component it would remount
 * every node on every render.
 *
 * `satisfies` over the union is what keeps the map and the node types in step: a
 * fifth canvas node, or a renamed `"spec"`, is a compile error here rather than a
 * type React Flow silently has no component for.
 */
export const NODE_TYPES = {
  spec: SpecNodeCard,
  column: ColumnHeaderNode,
  band: BandNodeBlock,
  lane: LaneRunBlock,
} satisfies Record<NonNullable<CanvasNode["type"]>, unknown>;
