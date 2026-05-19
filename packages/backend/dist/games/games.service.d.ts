import { GameState } from '@uttt/shared';
/**
 * A game session as stored in the service.
 * For v1 this is in-memory only — restart the server and games disappear.
 */
export interface StoredGame {
    id: string;
    state: GameState;
    createdAt: Date;
}
/**
 * Owns the in-memory map of active games. Other endpoints will gain methods
 * here (findById, applyMove, etc.) but the storage stays in this single place.
 *
 * The `@Injectable()` decorator marks this class as available to the NestJS
 * dependency-injection container. Nest instantiates it once (services are
 * singletons by default) and hands the same instance to anyone whose
 * constructor declares a `GamesService` parameter.
 */
export declare class GamesService {
    private readonly games;
    /** Create a fresh game and return it. */
    create(): StoredGame;
}
