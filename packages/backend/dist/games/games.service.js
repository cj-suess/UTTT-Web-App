"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamesService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@uttt/shared");
/**
 * Owns the in-memory map of active games. Other endpoints will gain methods
 * here (findById, applyMove, etc.) but the storage stays in this single place.
 *
 * The `@Injectable()` decorator marks this class as available to the NestJS
 * dependency-injection container. Nest instantiates it once (services are
 * singletons by default) and hands the same instance to anyone whose
 * constructor declares a `GamesService` parameter.
 */
let GamesService = class GamesService {
    games = new Map();
    /** Create a fresh game and return it. */
    create() {
        const id = (0, node_crypto_1.randomUUID)();
        const game = {
            id,
            state: (0, shared_1.initialState)(),
            createdAt: new Date(),
        };
        this.games.set(id, game);
        return game;
    }
};
exports.GamesService = GamesService;
exports.GamesService = GamesService = __decorate([
    (0, common_1.Injectable)()
], GamesService);
//# sourceMappingURL=games.service.js.map