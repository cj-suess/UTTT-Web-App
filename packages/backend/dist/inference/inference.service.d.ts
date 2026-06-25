import { GameState } from '@uttt/shared';
import { Difficulty } from '../games/create-game.dto';
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
    search_value: number;
}
export declare class InferenceService {
    private readonly logger;
    private readonly baseUrl;
    /**
     * ask the inference service for the best move from the given state
     * this will return the full MCTS analysis (visit counts, Q-values, principal
     * variation) so it can be stored for the hint endpoint
     *
     * @param state  current game state to analyze
     * @param sims   number of MCTS simulations
     */
    getMove(state: GameState, sims?: number, difficulty?: Difficulty): Promise<InferenceMoveResponse>;
}
