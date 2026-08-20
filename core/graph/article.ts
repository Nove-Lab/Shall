/**
 * "a" or "an", in front of one of the canon's own names.
 *
 * IT IS HERE BECAUSE THE NAMES ARE GENERATED AND THE SENTENCES ARE NOT. Every
 * refusal, hint and template line that names a type or a relation is built by
 * interpolation, so the article in front of it is written once, at authoring
 * time, against whichever name the author happened to be thinking of — and it
 * shipped as `a Actor`, `a Interface` and `a ImplementationTask` in the
 * reference templates a person reads before writing their first node. One rule
 * in one place is the only arrangement in which that cannot happen again.
 *
 * A, E, I AND O DECIDE IT, AND U IS ASKED SEPARATELY. The letter is a good
 * enough proxy for the sound in every name the canon has except one: `UseCase`
 * opens with the consonant sound of "yoo", so it takes `a`, and a plain vowel
 * test would write `an UseCase`. Every other U the canon might grow — an
 * `Update`, an `Upstream` — would want `an`, so this is not "U is never a
 * vowel": it is that the canon's one U-word says "yoo", and a name that does
 * not belongs in the list beside it.
 *
 * The edge types need no exception at all — `ADDRESSES`, `AFFECTS`,
 * `ALLOCATES`, `ASSUMES`, `EXPOSES` and `IS_REALIZED_BY` are the vowel-initial
 * ones and every one of them takes `an` — so the same rule serves both, and
 * there is no second copy to fall out of step.
 */

/** The canon's names whose first letter lies about their first sound. */
const SOUNDS_LIKE_A_CONSONANT: readonly string[] = ["UseCase"];

/** `a` or `an`, mid-sentence. */
export function articleFor(word: string): "a" | "an" {
  if (SOUNDS_LIKE_A_CONSONANT.includes(word)) {
    return "a";
  }
  return /^[AEIO]/i.test(word) ? "an" : "a";
}

/**
 * The same rule where a sentence starts. It is a second function rather than a
 * flag because the two read differently at the call site: a sentence that opens
 * on a type reads `${openingArticleFor(type)} ${type} does not carry…`, and one
 * that does not reads `relates ${articleFor(from)} ${from} to…`.
 */
export function openingArticleFor(word: string): "A" | "An" {
  return articleFor(word) === "an" ? "An" : "A";
}
