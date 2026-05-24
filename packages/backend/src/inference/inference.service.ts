import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GameState } from '@uttt/shared';

// ---------------------------------------------------------------------------
// Response types from the Python inference service (snake_case wire format).
// These match the Pydantic models defined in inference/main.py.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class InferenceService {
  private readonly logger = new Logger(InferenceService.name);
  /** Base URL of the Python inference service. Override via env var. */
  private readonly baseUrl =
    process.env['INFERENCE_URL'] ?? 'http://localhost:8000';

  /**
   * Ask the inference service for the best move from the given state.
   *
   * Returns the full MCTS analysis (visit counts, Q-values, principal
   * variation) so callers can store it for the learning-mode endpoint.
   *
   * @param state  Current game state to analyse.
   * @param sims   Number of MCTS simulations. Lower = faster but weaker.
   */
  async getMove(state: GameState, sims = 400): Promise<InferenceMoveResponse> {
    // Translate from camelCase (NestJS / @uttt/shared convention) to
    // snake_case (Python / FastAPI convention) before sending.
    const body = {
      state: {
        board: [...state.board],
        macro: [...state.macro],
        player: state.player,
        next_micro: state.nextMicro,    // nextMicro → next_micro
      },
      sims,
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
      // fetch() itself throws on network failure (service not running, wrong port, etc.)
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

    // The JSON already has snake_case field names; we expose them as-is so
    // consumers can decide how to present them. The analysis endpoint (step 8)
    // will do any camelCase conversion before forwarding to the frontend.
    return response.json() as Promise<InferenceMoveResponse>;
  }
}