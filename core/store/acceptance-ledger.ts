import {
  emitAcceptanceLedger,
  parseAcceptanceLedger,
  type AcceptanceLedgerReading,
  type AcceptanceRecord,
} from "../serialize/index.js";
import {
  readBack,
  readLedger,
  updateLedger,
  type LedgerCodec,
} from "./ledger-door.js";
import { invalid } from "./refusal.js";

/**
 * The acceptance ledger's door — `.shall/ledger/acceptances.yaml`, read and
 * written.
 *
 * THE MANNERS ARE `ledger-door.ts`'s AND THE FORMAT IS `serialize`'s. A closed
 * criterion is un-closed two ways: by ARITHMETIC — edit the criterion, or let
 * the list of evidence claiming it change, and the hashes stop agreeing and it
 * is open again on the next load — or by a PERSON leaving it open again with a
 * reason, which is `withdrawAcceptance` below followed by a record in the
 * rejection ledger. The two books hold a criterion in one or the other and
 * never both, and it is the daemon's doors that keep it so; this one only
 * removes the key it is asked to.
 *
 * NOTHING HERE CHECKS THAT THE EVIDENCE CLAIMS THE CRITERION. That is the
 * daemon's guard, made against a graph this module has never read; this door
 * writes the record it is handed, and the reader beside it refuses one that
 * names no evidence at all.
 */
const CODEC: LedgerCodec<AcceptanceRecord> = {
  noun: "acceptance ledger",
  parse: parseAcceptanceLedger,
  emit: emitAcceptanceLedger,
};

/**
 * The ledger as it stands, or the one sentence saying why it cannot be known.
 * A file that is not there is an empty ledger and not a problem: no criterion
 * has been closed yet, and the first closing writes the first bytes.
 */
export async function readAcceptanceLedger(
  file: string,
): Promise<AcceptanceLedgerReading> {
  return readLedger(file, CODEC);
}

/**
 * One criterion's latest acceptance, written into the ledger and handed back as
 * the file now says it.
 *
 * A criterion already in the book is REPLACED rather than added beside: it has
 * one latest closing, and the map's grammar is what says so. Closing it again on
 * more evidence is one record naming all of it, not two records to reconcile.
 */
export async function recordAcceptance(
  file: string,
  acId: string,
  record: AcceptanceRecord,
): Promise<AcceptanceRecord> {
  const records = await updateLedger(file, CODEC, (current) =>
    new Map(current).set(acId, record),
  );
  return readBack(records, acId, CODEC);
}

/**
 * A criterion's acceptance taken back — the key removed, so that leaving the
 * criterion open again with a reason leaves one book saying so and not two.
 * Refused when there is nothing to remove, inside the write turn, where the
 * answer cannot go stale between the looking and the writing.
 */
export async function withdrawAcceptance(
  file: string,
  acId: string,
): Promise<void> {
  await updateLedger(file, CODEC, (current) => {
    if (!current.has(acId)) {
      throw invalid(`${acId} carries no acceptance, so there is nothing to withdraw.`);
    }
    const next = new Map(current);
    next.delete(acId);
    return next;
  });
}
