import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  applyMove,
  GameState,
  initialState,
  isLegalMove,
  isTerminal,
  Move,
} from '@uttt/shared';
import {
  InferenceMoveResponse,
  InferenceService,
} from '../inference/inference.service';
import { buildHintPrompt } from '../llm/prompt-builder';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Owns the in-memory map of active games and all game-rule enforcement.
 * HTTP concerns belong in the controller; business rules live here.
 */
@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);
  private readonly games = new Map<string, StoredGame>();

  constructor(private readonly inferenceService: InferenceService) {}

  /** Create a fresh game and return it. */
  create(playerName: string): StoredGame {
    const id = randomUUID();
    const game: StoredGame = {
      id,
      state: initialState(),
      playerName: playerName,
      createdAt: new Date(),
      lastAnalysis: null,
    };
    this.games.set(id, game);
    this.logger.log('Game ID: ' + game.id, 'Player Name: ' + game.playerName);
    return game;
  }

  /** Look up an existing game by id. Throws 404 if not found. */
  findById(id: string): StoredGame {
    const game = this.games.get(id);
    if (!game) {
      throw new NotFoundException(`Game ${id} not found`);
    }
    return game;
  }

  /**
   * Apply a human move and return the updated game.
   * Throws 400 if the game is over or the move is illegal.
   */
  applyMove(id: string, move: Move): StoredGame {
    const game = this.findById(id);

    if (isTerminal(game.state)) {
      throw new BadRequestException('Game is already over');
    }
    if (!isLegalMove(game.state, move)) {
      throw new BadRequestException(
        `Move [${move[0]}, ${move[1]}] is not legal in the current position`,
      );
    }

    game.state = applyMove(game.state, move);
    return game;
  }

  /**
   * Ask the inference service for the best move, apply it, cache the full
   * analysis, and return the updated game.
   */
  async applyAiMove(id: string, sims?: number): Promise<StoredGame> {
    const game = this.findById(id);

    if (isTerminal(game.state)) {
      throw new BadRequestException('Game is already over');
    }

    const analysis = await this.inferenceService.getMove(game.state, sims);
    const move: Move = analysis.best_move;

    if (!isLegalMove(game.state, move)) {
      throw new InternalServerErrorException(
        `Inference returned illegal move [${move}] — possible state encoding mismatch`,
      );
    }

    game.state = applyMove(game.state, move);
    game.lastAnalysis = analysis;
    return game;
  }

  /**
   * Return the cached analysis from the AI's last move in this game.
   * Throws 400 if the AI hasn't moved yet (nothing cached).
   */
  getAnalysis(id: string): GameAnalysis {
    const game = this.findById(id);
    if (!game.lastAnalysis) {
      throw new BadRequestException(
        'No analysis available yet — the AI needs to make at least one move first.',
      );
    }
    const prompt = buildHintPrompt(game.state, this.transformAnalysis(game.lastAnalysis));
    this.logger.log('\n--- HINT PROMPT ---\n' + prompt + '\n---');
    return this.transformAnalysis(game.lastAnalysis);
  }

  /**
   * Exposes the state + transformed analysis together so the controller doesn't need to know about the internal lastAnalysis type.
   */
  getHintContext(id: string): { state: GameState; analysis: GameAnalysis } {
    const game = this.findById(id);
    if (!game.lastAnalysis) {
      throw new BadRequestException(
        'No analysis available yet — the AI needs to make at least one move first.',
      );
    }
    return {
      state: game.state,
      analysis: this.transformAnalysis(game.lastAnalysis),
    };
  }

  /**
   * Convert the snake_case inference response to camelCase for the frontend.
   * Also derives `winProbability` from `valueEstimate` for convenience.
   */
  private transformAnalysis(raw: InferenceMoveResponse): GameAnalysis {
    return {
      bestMove: raw.best_move,
      candidates: raw.candidates.map((c) => ({
        move: c.move,
        visits: c.visits,
        visitShare: c.visit_share,
        qValue: c.q_value,
        prior: c.prior,
        isBest: c.is_best,
      })),
      valueEstimate: raw.value_estimate,
      winProbability: (raw.value_estimate + 1) / 2,
      principalVariation: raw.principal_variation,
      simsUsed: raw.sims_used,
    };
  }
}