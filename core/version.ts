/**
 * core/version — the one semver, stamped once.
 *
 * The binary, the templates and the schema all ride this number: there is no
 * separate version of the agent kit, of the daemon's answers or of the file
 * format, because a person running Shall has one install and can only be told
 * one thing about how old it is. Anything that needs to say a version reads it
 * from here rather than writing it down again — a second copy is a second
 * answer, and the second answer is always the stale one.
 *
 * IT IS THE RELEASE TAG'S COUNTERPART. CI checks the tag a release is cut at
 * against this constant, so the number here is what shipped and not what
 * somebody meant to ship.
 */
export const SHALL_VERSION = "0.1.5";
