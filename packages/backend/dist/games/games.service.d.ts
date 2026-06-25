import { GameState, Move } from '@uttt/shared';
import { InferenceMoveResponse, InferenceService } from '../inference/inference.service';
import { Difficulty } from './create-game.dto';
export interface StoredGame {
    id: string;
    state: GameState;
    playerName: string;
    difficulty: Difficulty;
    createdAt: Date;
    lastAnalysis: InferenceMoveResponse | null;
    hintsUsed: number;
}
export interface CandidateMoveAnalysis {
    move: [number, number];
    visits: number;
    visitShare: number;
    qValue: number;
    prior: number;
    isBest: boolean;
}
/**
 * Primary tactical pattern of the recommended move, detected from game state.
 * Priority order: IMMEDIATE_WIN > BLOCK > FORK > FORK_BLOCK > CENTER_CONTROL
 *                 > CORNER_PLAY > POSITIONAL
 */
export type MoveStrategy = 'IMMEDIATE_WIN' | 'BLOCK' | 'FORK' | 'FORK_BLOCK' | 'CENTER_CONTROL' | 'CORNER_PLAY' | 'POSITIONAL';
/**
 * Analysis of where the recommended move sends the opponent.
 * UTTT-specific: the cell played determines the opponent's next board.
 */
export interface ConstraintAnalysis {
    /** Destination board is won/drawn — O gets a free move anywhere. */
    sendsToFreeMove: boolean;
    /** O can win the destination board in a single move — a dangerous send. */
    sendsToODanger: boolean;
    /** X already has a two-in-a-row threat in the destination board — a favourable send. */
    sendsToXStrong: boolean;
}
/**
 * Position type derived from MCTS statistics.
 *
 * FORCED    — one move dominated search (>75% visits); alternatives were clearly worse.
 * TACTICAL  — search significantly overruled the network's initial read; the best
 *             move required deep calculation rather than pattern recognition.
 * STRATEGIC — balanced position; several moves were reasonable; the winner is decided
 *             on long-term positional grounds.
 * DESPERATE — X has <30% winning chances; priority is damage limitation.
 */
export type PositionType = 'FORCED' | 'TACTICAL' | 'STRATEGIC' | 'DESPERATE';
/**
 * Macro-level threat flags computed from the game state and the recommended move.
 */
export interface MacroThreatContext {
    xWinsMicroBoard: boolean;
    xCreatesMacroThreat: boolean;
    oHasMacroThreat: boolean;
    blocksOThreat: boolean;
}
/**
 * Full analysis of an AI move, ready for the frontend and the hint prompt.
 */
export interface GameAnalysis {
    bestMove: [number, number];
    candidates: CandidateMoveAnalysis[];
    networkValue: number;
    searchValue: number;
    valueEstimate: number;
    winProbability: number;
    principalVariation: [number, number][];
    simsUsed: number;
    positionType: PositionType;
    priorOnBestMove: number;
    topMoveVisitShare: number;
    macroThreats: MacroThreatContext;
    moveStrategy: MoveStrategy;
    constraintAnalysis: ConstraintAnalysis;
}
export declare class GamesService {
    private readonly inferenceService;
    private readonly logger;
    private readonly games;
    constructor(inferenceService: InferenceService);
    create(playerName: string, difficulty?: Difficulty): StoredGame;
    findById(id: string): StoredGame;
    applyMove(id: string, move: Move): StoredGame;
    applyAiMove(id: string, sims?: number): Promise<StoredGame>;
    getAnalysis(id: string): GameAnalysis;
    getHintContext(id: string): {
        state: GameState;
        analysis: GameAnalysis;
    };
    /**
     * Single entry-point for turning a raw inference response into a full
     * GameAnalysis.  Both getAnalysis and getHintContext call this so that
     * every consumer always receives the complete enriched struct.
     */
    private buildAnalysis;
    /**
     * Detect the primary tactical pattern of the recommended move.
     * Checks are ordered by priority: immediate threats before positional concepts.
     */
    private detectMoveStrategy;
    /**
     * Analyse the constraint consequence of the recommended move —
     * i.e. which board O is sent to and how favourable that destination is.
     */
    private detectConstraintAnalysis;
    private classifyPosition;
    /**
     * Compute macro-level threat flags using the current game state and the
     * recommended move (PV[1]).
     *
     * All checks use pure game-rule logic — no network inference required.
     * player=1 is X (the human player whose recommended move we are analysing).
     */
    private computeMacroThreats;
}
