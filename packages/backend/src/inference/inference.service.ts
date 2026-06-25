import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GameState } from '@uttt/shared';
import { Difficulty } from '../games/create-game.dto';

// response types from the inference service

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

@Injectable()
export class InferenceService {
  private readonly logger = new Logger(InferenceService.name);
  // base URL of the inference service (override via env var)
  private readonly baseUrl =
    process.env['INFERENCE_URL'] ?? 'http://localhost:8000';

  /**
   * ask the inference service for the best move from the given state
   * this will return the full MCTS analysis (visit counts, Q-values, principal
   * variation) so it can be stored for the hint endpoint
   * 
   * @param state  current game state to analyze
   * @param sims   number of MCTS simulations
   */
  async getMove(state: GameState, sims = 400, difficulty: Difficulty = 'hard'): Promise<InferenceMoveResponse> {
    // translate from camelCase (NestJS/@uttt/shared) to snake_case (python/FastAPI) before sending
    const body = {
      state: {
        board: [...state.board],
        macro: [...state.macro],
        player: state.player,
        next_micro: state.nextMicro,    // nextMicro → next_micro
      },
      sims,
      difficulty,
    };

    let response: Response;
    try {
      const start = Date.now()
      response = await fetch(`${this.baseUrl}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const elapsed = Date.now() - start
      this.logger.log(`Inference call completed in ${elapsed}ms`)
    } catch {
      throw new ServiceUnavailableException(
        `Inference service unreachable at ${this.baseUrl}. Is it running?`,
      );
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new InternalServerErrorException(
        `Inference service error ${response.status}: ${detail}`,
      );
    }
    
    return response.json() as Promise<InferenceMoveResponse>;
  }
}