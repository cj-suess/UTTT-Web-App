"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var InferenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InferenceService = void 0;
const common_1 = require("@nestjs/common");
let InferenceService = InferenceService_1 = class InferenceService {
    logger = new common_1.Logger(InferenceService_1.name);
    // base URL of the inference service (override via env var)
    baseUrl = process.env['INFERENCE_URL'] ?? 'http://localhost:8000';
    /**
     * ask the inference service for the best move from the given state
     * this will return the full MCTS analysis (visit counts, Q-values, principal
     * variation) so it can be stored for the hint endpoint
     *
     * @param state  current game state to analyze
     * @param sims   number of MCTS simulations
     */
    async getMove(state, sims = 400, difficulty = 'hard') {
        // translate from camelCase (NestJS/@uttt/shared) to snake_case (python/FastAPI) before sending
        const body = {
            state: {
                board: [...state.board],
                macro: [...state.macro],
                player: state.player,
                next_micro: state.nextMicro, // nextMicro → next_micro
            },
            sims,
            difficulty,
        };
        let response;
        try {
            const start = Date.now();
            response = await fetch(`${this.baseUrl}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const elapsed = Date.now() - start;
            this.logger.log(`Inference call completed in ${elapsed}ms`);
        }
        catch {
            throw new common_1.ServiceUnavailableException(`Inference service unreachable at ${this.baseUrl}. Is it running?`);
        }
        if (!response.ok) {
            const detail = await response.text();
            throw new common_1.InternalServerErrorException(`Inference service error ${response.status}: ${detail}`);
        }
        return response.json();
    }
};
exports.InferenceService = InferenceService;
exports.InferenceService = InferenceService = InferenceService_1 = __decorate([
    (0, common_1.Injectable)()
], InferenceService);
//# sourceMappingURL=inference.service.js.map