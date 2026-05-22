"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var GamesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamesService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@uttt/shared");
const inference_service_1 = require("../inference/inference.service");
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
/**
 * Owns the in-memory map of active games and all game-rule enforcement.
 * HTTP concerns belong in the controller; business rules live here.
 */
let GamesService = GamesService_1 = class GamesService {
    inferenceService;
    logger = new common_1.Logger(GamesService_1.name);
    games = new Map();
    constructor(inferenceService) {
        this.inferenceService = inferenceService;
    }
    /** Create a fresh game and return it. */
    create(playerName) {
        const id = (0, node_crypto_1.randomUUID)();
        const game = {
            id,
            state: (0, shared_1.initialState)(),
            playerName: playerName,
            createdAt: new Date(),
            lastAnalysis: null,
        };
        this.games.set(id, game);
        this.logger.log(game.id, game.playerName);
        return game;
    }
    /** Look up an existing game by id. Throws 404 if not found. */
    findById(id) {
        const game = this.games.get(id);
        if (!game) {
            throw new common_1.NotFoundException(`Game ${id} not found`);
        }
        return game;
    }
    /**
     * Apply a human move and return the updated game.
     * Throws 400 if the game is over or the move is illegal.
     */
    applyMove(id, move) {
        const game = this.findById(id);
        if ((0, shared_1.isTerminal)(game.state)) {
            throw new common_1.BadRequestException('Game is already over');
        }
        if (!(0, shared_1.isLegalMove)(game.state, move)) {
            throw new common_1.BadRequestException(`Move [${move[0]}, ${move[1]}] is not legal in the current position`);
        }
        game.state = (0, shared_1.applyMove)(game.state, move);
        this.logger.log(JSON.stringify(game.state));
        return game;
    }
    /**
     * Ask the inference service for the best move, apply it, cache the full
     * analysis, and return the updated game.
     */
    async applyAiMove(id, sims) {
        const game = this.findById(id);
        if ((0, shared_1.isTerminal)(game.state)) {
            throw new common_1.BadRequestException('Game is already over');
        }
        const analysis = await this.inferenceService.getMove(game.state, sims);
        const move = analysis.best_move;
        if (!(0, shared_1.isLegalMove)(game.state, move)) {
            throw new common_1.InternalServerErrorException(`Inference returned illegal move [${move}] — possible state encoding mismatch`);
        }
        game.state = (0, shared_1.applyMove)(game.state, move);
        game.lastAnalysis = analysis;
        this.logger.log(JSON.stringify(game.state));
        return game;
    }
    /**
     * Return the cached analysis from the AI's last move in this game.
     * Throws 400 if the AI hasn't moved yet (nothing cached).
     */
    getAnalysis(id) {
        const game = this.findById(id);
        if (!game.lastAnalysis) {
            throw new common_1.BadRequestException('No analysis available yet — the AI needs to make at least one move first.');
        }
        return this.transformAnalysis(game.lastAnalysis);
    }
    /**
     * Convert the snake_case inference response to camelCase for the frontend.
     * Also derives `winProbability` from `valueEstimate` for convenience.
     */
    transformAnalysis(raw) {
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
};
exports.GamesService = GamesService;
exports.GamesService = GamesService = GamesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [inference_service_1.InferenceService])
], GamesService);
//# sourceMappingURL=games.service.js.map