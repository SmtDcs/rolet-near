import type { Action, MatchView } from "../nearTypes";
import type { Intent } from "../stage/protocol";

/**
 * Transport abstraction shared between practice mode (F3-9) and NEAR contract calls (Section C).
 */
export interface GameTransport {
  submitIntent(intent: Intent): Promise<Action[]>;
  onActions(cb: (actions: Action[]) => void): () => void;
  snapshot(): Promise<MatchView> | MatchView;
  dispose?(): void;
}
