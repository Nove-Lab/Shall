import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { StatusDot } from "./review-parts";
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
 *
 * THE INK ON THIS CANVAS IS ONE STEP HEAVIER THAN THE APP'S FURNITURE, and that
 * is a deliberate departure worth stating once here rather than four times
 * below. `--border` is the theme's hairline for panels and dialogs — surfaces a
 * hand's width apart on a page you read at rest — and at `oklch(0.922)` on
 * white it is a 0.08 step in lightness. This canvas is fifty 44px boxes, their
 * ruling and the relations between them, all read at once and at a distance,
 * and against the card id beside them every one of those lines disappeared. So
 * the lines and the secondary text here are DERIVED from `--muted-foreground`
 * and `--card-foreground` at a fraction, in the same way a Tailwind `/40`
 * derives one: no new token, no hex, and the derivation follows the theme
 * because what it is a fraction OF follows the theme. The two weights are
 * `RULE_INK` below and the `/50` the card and the band rule wear.
 */

/**
 * A rule is one pixel, and a rule drawn inside a box the layout has already
 * measured has to be paid for out of that box.
 *
 * IT USED TO BE A LOCAL CONSTANT HERE, on the grounds that nothing about where a
 * card goes depended on it. That stopped being true when the grid's stack was
 * given one symmetric gap: a card is spaced against the RULES above and below it
 * now, so the hairline's own pixel is a term in `grid.rowGap` and in
 * `grid.bandPadding`, and a rule drawn thicker than the layout believes would
 * put every card in the grid nearer one of its two rules than the other. It
 * lives in `GEOMETRY` for exactly the reason everything else there does, and is
 * aliased here so the two components that paint a border read one name. The
 * third rule on the canvas is the lane's, and it arrives on `data` from the same
 * constant — see `LaneRunBlock`.
 *
 * IT IS THE BORDER'S OWN WIDTH AND NOT ONLY THE PADDING'S TERM. A Tailwind
 * `border-t`/`border-b` writes 1px, which is this number today and is a second
 * home for it tomorrow: the two would diverge on the first edit and the picture
 * would be wrong with nothing to error — the band label a pixel off the column
 * headers it shares a line with, in every band. So the width is declared from
 * here and the class is dropped. Nothing about the border's LOOK is declared
 * here: `*` carries `border-border` over preflight's `border: 0 solid`, so a
 * width alone paints a hairline without a colour being written — which is what
 * the two components below now override, each in the way its own line is drawn.
 */
const RULE = GEOMETRY.ruleThickness;

/**
 * THE COLOUR OF THE RULED LADDER — the column header's closing rule and every
 * lane hairline under it, which are one continuous ladder and not two things
 * that happen to look alike. The grid spaces its first card below the header's
 * rule exactly as it spaces every later card below a lane's, so a header rule
 * drawn in one ink and a lane rule in another would make the first row of every
 * column look like a different kind of row.
 *
 * IT IS A CONSTANT AND NOT TWO UTILITIES BECAUSE ONE OF ITS TWO USES IS A
 * GRADIENT STOP. `LaneRunBlock` rules its paper with a
 * `repeating-linear-gradient`, and a gradient stop cannot be a Tailwind class;
 * writing the header's rule as `border-b-muted-foreground/35` would leave the
 * ladder's colour with two homes and a percentage to keep in step by hand.
 *
 * 35% AND NOT MORE, because this is the quietest line on the board and there
 * are hundreds of them. It is about twice the step `--border` gave — 0.15 in
 * lightness against 0.08 in light, 0.19 against 0.10 in dark — which is enough
 * to see the empty rows without the empty part of a band reading as content.
 *
 * EVERY WEIGHT ON THIS CANVAS COMES OUT HEAVIER IN THE DARK THEME than in the
 * light one, here and below, and that is a property of the tokens rather than a
 * second set of choices: `--muted-foreground` sits further from `--card` in
 * dark than in light, so one fraction of it buys a bigger step there. It lands
 * the right way round — dark is the theme where a card and the canvas behind it
 * are the SAME token, so the lines are doing more of the work.
 */
const RULE_INK = "color-mix(in oklab, var(--muted-foreground) 35%, transparent)";

/**
 * WHAT THE SELECTION PUSHES BACK IS DRAWN AT ONE FADE, and this is it — the
 * cards here, and the relations that do not touch the selection over in
 * `FloatingEdge.tsx`, which imports this name rather than restating the number.
 *
 * IT IS A FADE AND NEVER A `hidden`. Everything outside the one-hop
 * neighbourhood stays on the board at reduced strength: a card that is not drawn
 * is a card the graph does not have, and a person reading the canvas cannot tell
 * those two apart — see `view/highlight.ts`, which is where that rule is
 * written down and where the membership it applies to is decided.
 *
 * 40% AND NOT LESS, because a dimmed card is still a card you can aim at. It
 * carries an id, a name and a hit target: clicking one moves the highlight to it,
 * which is the ordinary way to walk the graph a hop at a time, and a fade deep
 * enough to make the id unreadable would turn every second click into a guess.
 */
export const RECEDED = "opacity-40";

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
 * ITS OWN BORDER IS NOT ONE OF THE STACK'S RULES, which is why it is a plain
 * `border` while the two below declare their width from `RULE`. A rule is a line
 * the grid SPACES against — `ruleThickness` is a term of `rowGap` and of
 * `bandPadding` — and this line is a term of the card's own 44, inside a box the
 * layout declared and `border-box` keeps: draw it heavier and the card looks
 * different and nothing on the board moves.
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
        //
        // `transition` and not `transition-colors`: the highlight moves the ring
        // and the fade as well as the border, and Tailwind's bare `transition`
        // is the list that carries all three. It carries no size — width and
        // height are inline styles from the layout, and a card that eased into a
        // new box would be drawn somewhere its relations are not.
        "bg-card text-card-foreground relative flex flex-col rounded-md border px-2 py-1.25 transition",
        /* THE THREE STATES OF THE ONE-HOP HIGHLIGHT, loudest first, and the
           hierarchy is the message: the clicked card wears the ring, a neighbour
           wears the same accent quieter and nothing else, and a card the
           selection does not reach keeps its resting border and fades.

           A NEIGHBOUR GETS NO RING ON PURPOSE. It is the answer to "what does
           this touch", not a second selection, and two ringed cards on a board
           read as two things open. The hover accent is dropped where a neighbour
           already wears one — the card is still clickable, and the border it
           would move to is the border it already has. */
        /* THE RESTING BORDER IS `--muted-foreground` AT HALF AND NOT `--border`,
           which is the one change here that is about reading rather than about
           the highlight. `--border` drew this box at a 0.08 step in lightness
           against a card id set at full `--card-foreground` — the id was the
           only thing on the card you could see, and the card itself was a rumour.
           Half of `--muted-foreground` is a 0.21 step in light and 0.27 in dark,
           against the 0.08 and 0.10 `--border` gave: a hairline you can follow
           around all four sides at a glance, and still a grey rather than a box
           drawn in the text's own ink.

           IT MATTERS MOST IN THE DARK THEME, where `--card` and the canvas
           behind it are the SAME token — a card there is a rectangle its border
           alone distinguishes from the surface, and that border was a 10%-alpha
           white. */
        data.picked
          ? "border-primary ring-ring/50 ring-3"
          : data.neighbour
            ? "border-primary/60"
            : "border-muted-foreground/50 hover:border-primary/40",
        data.dimmed && RECEDED,
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
        {/* THE TRAFFIC LIGHT, AND THE ARITHMETIC HAS LANDED. The verdict is
            `core/arith`'s, computed on every read of the graph and carried here
            as a WORD on `data` — `view/furniture.ts` holds no paint — so what
            this square shows is what the daemon said about this node and not
            anything the canvas worked out for itself.

            THE THREE COLOURS ARE STILL TAILWIND PALETTE VALUES, for the reason
            the placeholder gave: a traffic light is not a role the design system
            names, and three tokens invented for it would be a design-system
            setting this feature made up. They live in `SIGNAL_CLASS` beside the
            component that paints them.

            `null` DRAWS NOTHING, ON PURPOSE AND WITHOUT MOVING ANYTHING. Every
            canon type is coloured — the execution band included — so `null` is
            only a card the review has not answered for yet, and a fourth colour
            meaning "not answered" would be a verdict; the card's box is the
            layout's own declaration, so the card with no square is exactly the
            size of the ones beside it and nothing on the board moves. */}
        {data.signal === null ? null : <StatusDot color={data.signal} />}
        <span className="truncate font-mono text-xs">{data.node.id}</span>
      </div>
      {/* THE SHORT NAME IS THE CARD'S OWN INK AT 70% AND NOT `--muted-foreground`.
          The id above it is the readability this canvas is calibrated to, and
          the second line has to stay a step under it without falling out of the
          card: `--muted-foreground` on white is 4.7:1 at 12px, a hair over the
          4.5 floor for small text and washed out beside a 19.8:1 id.
          `--card-foreground` at 70% is 7.6:1 in light and 8.8:1 in dark —
          plainly secondary, plainly legible, and derived from the card's own
          foreground token rather than the page's, because that is what this
          box declares its text in. */}
      <span className="text-card-foreground/70 truncate text-xs">
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
 * `grid.headerHeight` is literally `bandGap + this + stackGap`, so every card in
 * the grid is placed by this number; a header that drew one pixel taller than
 * the layout reserved would push its label into the clearance above the band's
 * first row, in every band, with nothing to error. Declaring it here is what
 * makes the drawn header and the reserved header the same header.
 *
 * THE BOTTOM BORDER IS THE STACK'S FIRST RULE and not decoration on the label.
 * The grid spaces its first card `stackGap` under it, exactly as it spaces every
 * later card under the lane's own hairlines, so it is one of the terms
 * `GEOMETRY.ruleThickness` accounts for and is drawn AT it — see `RULE` above for
 * why that is a declared width and not a `border-b`.
 *
 * The 21 the height comes to is this block's own arithmetic read forwards: a
 * `text-xs` label is a 16px line box, `pb-1` is 4, the rule is `RULE`. Change the
 * label's size and this component's height does not change — `GEOMETRY` does, and
 * the grid moves with it.
 *
 * The count is the only number on this canvas that is not a coordinate, so it is
 * set in the mono face to keep it from reading as part of the name.
 *
 * ITS INK IS `--foreground` AT 70% AND ITS RULE IS `RULE_INK`, which are two
 * different weights on one element on purpose: the label names a column and is
 * read, the rule under it is the top rung of the ladder and is only followed.
 * The label was `--muted-foreground`, a step fainter than the card ids it sits
 * over and the faintest text on the board; the rule was `--border`, which under
 * a label is invisible.
 */
export function ColumnHeaderNode({ data }: NodeProps<ColumnNode>) {
  return (
    <div
      className="text-foreground/70 flex items-baseline justify-between gap-1.5 pb-1 text-xs"
      style={{
        width: data.width,
        height: GEOMETRY.columnHeaderHeight,
        borderBottomWidth: RULE,
        borderBottomColor: RULE_INK,
      }}
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
 * A BAND — the strip the cards of one zone sit on, with the zone's name in the
 * gutter to the left of the first column.
 *
 * IT HAS NO GROUND, AND THAT IS THE WHOLE OF WHY THE GRID AND THE GRAPH ARE ONE
 * SURFACE NOW. This used to paint `bg-muted/30`, a wash the bands laid over the
 * canvas — and because the bands stop where the last band's last row stops, the
 * wash stopped there too. On a short board that put a visible colour change part
 * way down the pane: everything above it was grey, everything below it was the
 * `--card` the canvas paints, and the requirement is that where the board ends
 * is not a thing you can see. It was also the whole of why the grid read grey
 * and the graph read white, since only the grid has bands.
 *
 * SO THE BAND IS LEGIBLE FROM TWO THINGS INSTEAD OF THREE: the rule across its
 * top, and its name in the gutter. Both are drawn a step heavier than they were
 * to carry the weight the wash was carrying — the rule at half of
 * `--muted-foreground` rather than at `--border`, one step above the ladder's
 * `RULE_INK` because this line divides the board's four zones and the ladder
 * only counts rows.
 *
 * THE RULE IS A `border-t-*` UTILITY AND THE WIDTH IS STILL INLINE. Only the
 * colour moves to a class; the pixel stays declared from `RULE` for the reason
 * two paragraphs down.
 *
 * THE LABEL IS PLACED ON THE SAME LINE AS THE COLUMN HEADERS. Those sit at
 * `bandGap` below the band's top, and the band's own rule is inside the band's
 * declared height, so the padding above the label is `bandGap` less that rule.
 * It sits in the gutter — no column starts inside `bandGutter`, which is why
 * there is somewhere to put it at all.
 *
 * THAT SUBTRACTION IS WHY THE RULE IS DRAWN AT `RULE` and not at a `border-t`:
 * the two terms have to be the same pixel or the label lands `bandGap` less the
 * difference, a pixel off every column header on its line.
 */
export function BandNodeBlock({ data }: NodeProps<BandNode>) {
  return (
    <div
      className={cn(
        /* A RULE DIVIDES TWO BANDS, so the first band has nothing above it to be
           divided from and draws none — the board opens on its content the same
           way it ends on it, with no line closing either end. The pixel is still
           RESERVED rather than dropped: every band's insides are laid out against
           its own top rule, and a band that reclaimed that pixel would carry its
           label and its columns one pixel higher than the three below it. So the
           width stays and only the ink goes. */
        data.ruled ? "border-t-muted-foreground/50" : "border-t-transparent",
      )}
      style={{ width: data.width, height: data.height, borderTopWidth: RULE }}
    >
      <span
        className="text-foreground/70 block truncate text-xs"
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
 * THE EMPTY GRID, DRAWN: a ladder of hairlines one card wide, ruled once per row
 * slot, as many times as the band is tall.
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
 * WHERE THE HAIRLINE SITS IS NOT THIS FILE'S TO DECIDE, and every number in the
 * gradient below arrives on `data`. The rule is `stackGap` BELOW the foot of the
 * card, not flush against it: the layout spaces a card the same distance from
 * the rule above it as from the rule below it, and that gap is a term of the
 * pitch the cards were placed at. Ruling flush — which is what this drew before,
 * with the offset happening to equal the card's own height — left every card
 * touching one rule and 5px from the other. `data.height` is the layout's own
 * number too, and is never recomputed here as `rows * rowPitch`, which would be
 * a second expression for the box the library was already told about.
 */
export function LaneRunBlock({ data }: NodeProps<LaneNode>) {
  const { ruleOffset, ruleThickness, rowPitch } = data;
  const ruleEnd = ruleOffset + ruleThickness;
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        // A gradient and not a repeated element: nothing to mount, nothing to
        // measure. The stops are `RULE_INK` — the same expression the column
        // header's closing rule is drawn in, because the header's rule and these
        // are one ladder — and it is still a derivation of a theme token rather
        // than a value copied out of one, so it follows the theme.
        backgroundImage:
          `repeating-linear-gradient(to bottom,` +
          ` transparent 0, transparent ${String(ruleOffset)}px,` +
          ` ${RULE_INK} ${String(ruleOffset)}px,` +
          ` ${RULE_INK} ${String(ruleEnd)}px,` +
          ` transparent ${String(ruleEnd)}px,` +
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
