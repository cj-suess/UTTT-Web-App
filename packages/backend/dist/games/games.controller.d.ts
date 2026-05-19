import { GamesService, StoredGame } from './games.service';
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
    /**
     * POST /games — create a fresh game and return it.
     */
    create(): StoredGame;
}
