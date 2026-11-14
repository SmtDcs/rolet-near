import type { Action, ActionsPage } from "../nearTypes";

export interface MergeActionsResult {
  apply: Action[];
  resync: boolean;
  nextSeq: number;
}

/**
 * Merges a paged `get_actions` response against `lastSeq` (CLIENT-CONTRACT (c)).
 * When `first_seq > lastSeq + 1`, log entries fell off the 32-action cap and
 * callers must resync via `get_match`. Overlapping/duplicate actions are skipped.
 */
export function mergeActionsPage(
  lastSeq: number,
  page: ActionsPage,
  sinceSeq: number = lastSeq,
): MergeActionsResult {
  if (page.first_seq > lastSeq + 1) {
    return { apply: [], resync: true, nextSeq: lastSeq };
  }
  if (page.actions.length === 0) {
    return { apply: [], resync: false, nextSeq: lastSeq };
  }
  const pageStartSeq = Math.max(page.first_seq, sinceSeq + 1);
  const skip = Math.max(0, lastSeq + 1 - pageStartSeq);
  const apply = page.actions.slice(skip);
  return {
    apply,
    resync: false,
    nextSeq: lastSeq + apply.length,
  };
}
