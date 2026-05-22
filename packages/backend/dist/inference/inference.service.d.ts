import { GameState } from '@uttt/shared';
export interface InferenceCandidateMove {
    move: [number, number];
    visits: number;
    visit_share: number;
    q_value: number;
    prior: number;
    is_best: boolean;
}
export interface InferenceMoveResponse {
    best_move: [number, number];
    candidates: InferenceCandidateMove[];
    value_estimate: number;
    principal_variation: [number, number][];
    sims_used: number;
}
export declare class InferenceService {
    private readonly logger;
    /** Base URL of the Python inference service. Override via env var. */
    private readonly baseUrl;
    /**
     * Ask the inference service for the best move from the given state.
     *
     * Returns the full MCTS analysis (visit counts, Q-values, principal
     * variation) so callers can store it for the learning-mode endpoint.
     *
     * @param state  Current game state to analyse.
     * @param sims   Number of MCTS simulations. Lower = faster but weaker.
     */
    getMove(state: GameState, sims?: number): Promise<InferenceMoveResponse>;
}
