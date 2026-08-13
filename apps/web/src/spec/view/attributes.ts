/**
 * THE THREE ARITHMETIC QUESTIONS THE NODE FORM ASKS ABOUT ATTRIBUTES: what a
 * stored value READS as, whether the type's REQUIRED slots are filled, and what
 * a save actually SENDS.
 *
 * The roster itself is canon and lives in `@shall/core/graph` — which attributes
 * a type carries, their order, their kinds, their vocabularies and which of them
 * it requires. Nothing is restated here. What is here is the handful of answers
 * a form needs that the roster alone does not give, kept out of the panel for
 * the same reason as everything else in `view/`: they are functions of their
 * arguments, so they can be read and checked without a screen.
 *
 * THE EMPTINESS RULE IS THE DAEMON'S, WORD FOR WORD. A value that trims to
 * nothing is not a value — the same sentence `validateAttributes` is written
 * from — and it has to be the same rule on both sides or the save button lights
 * for a node the write door then refuses, or stays dark on one it would have
 * taken. The door remains the authority; this only decides what the panel
 * offers.
 *
 * `fieldsShownFor` AND `HeldFields` ARE NOT PORTED, deliberately. The previous
 * system fetched its roster over HTTP, so a form had to cope with not knowing
 * yet which fields a type had, and had to hold the values of a type it might
 * still be told about. Ours is a compiled import: `attributesFor` answers
 * synchronously, on the first render, for every type. There is nothing to wait
 * for and therefore nothing to hold.
 *
 * Pure: no React, no DOM, no clock, no randomness.
 */
import { attributesFor, type AttributeDescriptor } from "@shall/core/graph";

/**
 * What a person reads for one stored value.
 *
 * A `choice` stores `external_system` and shows `External System`; `line` and
 * `prose` store what was typed and show it back. The translation only ever runs
 * this way round — no layer turns a label into a value — so a vocabulary that
 * loses a value later still displays the rows already written with it, as
 * itself, rather than as a blank.
 */
export function displayedValue(
  descriptor: AttributeDescriptor,
  value: string,
): string {
  if (descriptor.kind !== "choice") {
    return value;
  }
  const choice = (descriptor.values ?? []).find(
    (candidate) => candidate.value === value,
  );
  return choice?.label ?? value;
}

/**
 * The labels of the required slots this draft has not filled — empty when the
 * save button may light.
 *
 * It takes the descriptors rather than the type name because the panel already
 * derived them for the controls it is drawing, and a second lookup here could
 * only ever disagree with what is on screen.
 *
 * IT ANSWERS IN LABELS, which is what the daemon's refusal names too, so the two
 * sentences would agree if the panel ever chose to write one. Today the caller
 * only asks whether the list is empty: a "required" sentence under a field
 * nobody has reached yet is noise, which is the same reason the id says its
 * problem only once somebody has touched it.
 */
export function unfilledRequired(
  descriptors: readonly AttributeDescriptor[],
  draft: Record<string, string>,
): readonly string[] {
  return descriptors
    .filter(
      (descriptor) =>
        descriptor.required && (draft[descriptor.name] ?? "").trim() === "",
    )
    .map((descriptor) => descriptor.label);
}

/**
 * WHAT A SAVE SENDS: this type's ENTIRE roster, and nothing else.
 *
 * TWO CLAIMS, AND BOTH ARE LOAD-BEARING.
 *
 * NOTHING OFF THE ROSTER LEAVES. The draft is keyed by column name and outlives
 * a change of type — that is what lets a Requirement retyped as a Finding keep
 * the statement someone wrote — so it can hold values for columns the type on
 * screen does not carry. Those would be refused by name (`A Finding does not
 * carry priority`), which is the right answer to a program and a baffling one to
 * a person who cannot see the field being complained about. They stop here.
 *
 * EVERY SLOT IS NAMED, INCLUDING THE EMPTY ONES. The write door overwrites the
 * whole map — an absent name is a cleared cell, not an unmentioned one — so a
 * partial map would silently erase the slots it left out. Sending the roster
 * whole makes the two indistinguishable on purpose: an empty string and an
 * absent key both mean "this slot is empty", and the panel never has to know
 * which spelling the door prefers.
 *
 * The values are trimmed on the way out for the reason the other fields are:
 * the door trims before it stores, so what is sent is what lands and the panel
 * is not showing one string while the table holds another.
 *
 * A type outside the canon has no roster and therefore sends nothing. The door
 * refuses the type itself, in a sentence about the type, which is the useful
 * half of that answer.
 */
export function attributesToSend(
  nodeType: string,
  draft: Record<string, string>,
): Record<string, string> {
  const sent: Record<string, string> = {};
  for (const descriptor of attributesFor(nodeType) ?? []) {
    sent[descriptor.name] = (draft[descriptor.name] ?? "").trim();
  }
  return sent;
}
