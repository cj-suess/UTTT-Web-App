import { GameState, Move } from '@uttt/shared';
import { InferenceMoveResponse, InferenceService } from '../inference/inference.service';
/**
 * A game session as stored in the service.
 * For v1 this is in-memory only — restart the server and games disappear.
 *
 * `lastAnalysis` caches the full MCTS readout from the AI's most recent
 * move so the analysis endpoint can return it without re-running MCTS.
 */
export interface StoredGame {
    id: string;
    state: GameState;
    playerName: string;
    createdAt: Date;
    lastAnalysis: InferenceMoveResponse | null;
}
/** Per-move breakdown, camelCase for the frontend. */
export interface CandidateMoveAnalysis {
    move: [number, number];
    visits: number;
    visitShare: number;
    qValue: number;
    prior: number;
    isBest: boolean;
}
/**
 * The full analysis of an AI move, ready for the frontend.
 *
 * `winProbability` is derived from `valueEstimate` by mapping [-1, 1] to
 * [0, 1]: (valueEstimate + 1) / 2. A value of 0.5 means the position is
 * even; 0.7 means the player to move is expected to win 70% of the time.
 */
export interface GameAnalysis {
    bestMove: [number, number];
    candidates: CandidateMoveAnalysis[];
    valueEstimate: number;
    winProbability: number;
    principalVariation: [number, number][];
    simsUsed: number;
}
/**
 * Owns the in-memory map of active games and all game-rule enforcement.
 * HTTP concerns belong in the controller; business rules live here.
 */
export declare class GamesService {
    private readonly inferenceService;
    private readonly logger;
    private readonly games;
    constructor(inferenceService: InferenceService);
    /** Create a fresh game and return it. */
    create(playerName: string): StoredGame;
    /** Look up an existing game by id. Throws 404 if not found. */
    findById(id: string): StoredGame;
    /**
     * Apply a human move and return the updated game.
     * Throws 400 if the game is over or the move is illegal.
     */
    applyMove(id: string, move: Move): StoredGame;
    /**
     * Ask the inference service for the best move, apply it, cache the full
     * analysis, and return the updated game.
     */
    applyAiMove(id: string, sims?: number): Promise<StoredGame>;
    /**
     * Return the cached analysis from the AI's last move in this game.
     * Throws 400 if the AI hasn't moved yet (nothing cached).
     */
    getAnalysis(id: string): GameAnalysis;
    /**
     * Exposes the state + transformed analysis together so the controller doesn't need to know about the internal lastAnalysis type.
     */
    getHintContext(id: string): {
        state: GameState;
        analysis: GameAnalysis;
    };
    /**
     * Convert the snake_case inference response to camelCase for the frontend.
     * Also derives `winProbability` from `valueEstimate` for convenience.
     */
    private transformAnalysis;
}
