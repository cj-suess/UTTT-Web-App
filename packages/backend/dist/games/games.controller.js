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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamesController = void 0;
const common_1 = require("@nestjs/common");
const apply_move_dto_1 = require("./apply-move.dto");
const games_service_1 = require("./games.service");
const create_game_dto_1 = require("./create-game.dto");
const prompt_builder_1 = require("../llm/prompt-builder");
const llm_service_1 = require("../llm/llm.service");
const common_2 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
/**
 * HTTP endpoints for managing game sessions.
 *
 * `@Controller('games')` mounts all routes here under `/games`. The
 * constructor parameter is the dependency-injection seam: NestJS sees that
 * this controller needs a `GamesService` and supplies the singleton
 * instance automatically — we never write `new GamesService()` ourselves.
 */
let GamesController = class GamesController {
    gamesService;
    llmService;
    constructor(gamesService, llmService) {
        this.gamesService = gamesService;
        this.llmService = llmService;
    }
    /** POST /games — create a fresh game and return it. */
    create(body) {
        return this.gamesService.create(body.playerName);
    }
    /** GET /games/:id — fetch an existing game by id. */
    findById(id) {
        return this.gamesService.findById(id);
    }
    /**
     * POST /games/:id/moves — apply a human move and return the updated game.
     * Body must match `{ move: [m, c] }` — validated by the global ValidationPipe.
     */
    applyMove(id, body) {
        return this.gamesService.applyMove(id, body.move);
    }
    /**
     * POST /games/:id/ai-move — run MCTS and apply the AI's chosen move.
     * Optional ?sims=N lets you trade off speed vs strength without code changes.
     */
    aiMove(id, simsParam) {
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
    getAnalysis(id) {
        return this.gamesService.getAnalysis(id);
    }
    hintStream(id) {
        return new rxjs_1.Observable(subscriber => {
            (async () => {
                const { state, analysis } = this.gamesService.getHintContext(id);
                const prompt = (0, prompt_builder_1.buildHintPrompt)(state, analysis);
                if (!prompt) {
                    subscriber.error(new common_1.BadRequestException('Insufficient data to generate a hint.'));
                    return;
                }
                for await (const token of this.llmService.streamHint(prompt)) {
                    subscriber.next({ data: { token } });
                }
                subscriber.complete();
            })().catch(err => subscriber.error(err));
        });
    }
};
exports.GamesController = GamesController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_game_dto_1.CreateGameDto]),
    __metadata("design:returntype", Object)
], GamesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], GamesController.prototype, "findById", null);
__decorate([
    (0, common_1.Post)(':id/moves'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, apply_move_dto_1.ApplyMoveDto]),
    __metadata("design:returntype", Object)
], GamesController.prototype, "applyMove", null);
__decorate([
    (0, common_1.Post)(':id/ai-move'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('sims')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], GamesController.prototype, "aiMove", null);
__decorate([
    (0, common_1.Get)(':id/analysis'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], GamesController.prototype, "getAnalysis", null);
__decorate([
    (0, common_1.Get)(':id/hint'),
    (0, common_2.Sse)(),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", rxjs_1.Observable)
], GamesController.prototype, "hintStream", null);
exports.GamesController = GamesController = __decorate([
    (0, common_1.Controller)('games'),
    __metadata("design:paramtypes", [games_service_1.GamesService,
        llm_service_1.LLMService])
], GamesController);
//# sourceMappingURL=games.controller.js.map