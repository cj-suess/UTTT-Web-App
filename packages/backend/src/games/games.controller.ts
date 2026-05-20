import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApplyMoveDto } from './apply-move.dto';
import { GameAnalysis, GamesService, StoredGame } from './games.service';

/**
 * HTTP endpoints for managing game sessions.
 *
 * `@Controller('games')` mounts all routes here under `/games`. The
 * constructor parameter is the dependency-injection seam: NestJS sees that
 * this controller needs a `GamesService` and supplies the singleton
 * instance automatically — we never write `new GamesService()` ourselves.
 */
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /** POST /games — create a fresh game and return it. */
  @Post()
  create(): StoredGame {
    return this.gamesService.create();
  }

  /** GET /games/:id — fetch an existing game by id. */
  @Get(':id')
  findById(@Param('id') id: string): StoredGame {
    return this.gamesService.findById(id);
  }

  /**
   * POST /games/:id/moves — apply a human move and return the updated game.
   * Body must match `{ move: [m, c] }` — validated by the global ValidationPipe.
   */
  @Post(':id/moves')
  applyMove(
    @Param('id') id: string,
    @Body() body: ApplyMoveDto,
  ): StoredGame {
    return this.gamesService.applyMove(id, body.move);
  }

  /**
   * POST /games/:id/ai-move — run MCTS and apply the AI's chosen move.
   * Optional ?sims=N lets you trade off speed vs strength without code changes.
   */
  @Post(':id/ai-move')
  aiMove(
    @Param('id') id: string,
    @Query('sims') simsParam?: string,
  ): Promise<StoredGame> {
    const sims = simsParam !== undefined ? parseInt(simsParam, 10) : undefined;
    return this.gamesService.applyAiMove(id, sims);
  }

  /**
   * GET /games/:id/analysis — return the cached MCTS analysis from the AI's
   * last move, camelCased and with a derived winProbability field.
   *
   * Returns 400 if the AI has not moved yet in this game.
   * Returns 404 if the game does not exist.
   */
  @Get(':id/analysis')
  getAnalysis(@Param('id') id: string): GameAnalysis {
    return this.gamesService.getAnalysis(id);
  }
}