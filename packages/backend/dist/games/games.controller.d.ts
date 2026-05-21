import { ApplyMoveDto } from './apply-move.dto';
import { GameAnalysis, GamesService, StoredGame } from './games.service';
import { CreateGameDto } from './create-game.dto';
/**
 * HTTP endpoints for managing game sessions.
 *
 * `@Controller('games')` mounts all routes here under `/games`. The
 * constructor parameter is the dependency-injection seam: NestJS sees that
 * this controller needs a `GamesService` and supplies the singleton
 * instance automatically — we never write `new GamesService()` ourselves.
 */
export declare class GamesController {
    private readonly gamesService;
    constructor(gamesService: GamesService);
    /** POST /games — create a fresh game and return it. */
    create(body: CreateGameDto): StoredGame;
    /** GET /games/:id — fetch an existing game by id. */
    findById(id: string): StoredGame;
    /**
     * POST /games/:id/moves — apply a human move and return the updated game.
     * Body must match `{ move: [m, c] }` — validated by the global ValidationPipe.
     */
    applyMove(id: string, body: ApplyMoveDto): StoredGame;
    /**
     * POST /games/:id/ai-move — run MCTS and apply the AI's chosen move.
     * Optional ?sims=N lets you trade off speed vs strength without code changes.
     */
    aiMove(id: string, simsParam?: string): Promise<StoredGame>;
    /**
     * GET /games/:id/analysis — return the cached MCTS analysis from the AI's
     * last move, camelCased and with a derived winProbability field.
     *
     * Returns 400 if the AI has not moved yet in this game.
     * Returns 404 if the game does not exist.
     */
    getAnalysis(id: string): GameAnalysis;
}
