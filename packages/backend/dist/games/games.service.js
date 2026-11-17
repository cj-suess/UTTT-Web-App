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
// Win-line lookup (used for macro threat detection)
// ---------------------------------------------------------------------------
const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6], // diagonals
];
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
let GamesService = GamesService_1 = class GamesService {
    inferenceService;
    logger = new common_1.Logger(GamesService_1.name);
    games = new Map();
    constructor(inferenceService) {
        this.inferenceService = inferenceService;
    }
    create(playerName, difficulty = 'hard') {
        const id = (0, node_crypto_1.randomUUID)();
        const game = {
            id,
            state: (0, shared_1.initialState)(),
            playerName,
            difficulty,
            createdAt: new Date(),
            lastAnalysis: null,
            hintsUsed: 0,
        };
        this.games.set(id, game);
        this.logger.log(`Game ID: ${game.id}  Player: ${game.playerName}  Difficulty: ${game.difficulty}`);
        return game;
    }
    findById(id) {
        const game = this.games.get(id);
        if (!game)
            throw new common_1.NotFoundException(`Game ${id} not found`);
        return game;
    }
    applyMove(id, move) {
        const game = this.findById(id);
        if ((0, shared_1.isTerminal)(game.state))
            throw new common_1.BadRequestException('Game is already over');
        if (!(0, shared_1.isLegalMove)(game.state, move))
            throw new common_1.BadRequestException(`Move [${move[0]}, ${move[1]}] is not legal in the current position`);
        game.state = (0, shared_1.applyMove)(game.state, move);
        return game;
    }
    async applyAiMove(id, sims) {
        const game = this.findById(id);
        if ((0, shared_1.isTerminal)(game.state))
            throw new common_1.BadRequestException('Game is already over');
        const analysis = await this.inferenceService.getMove(game.state, sims, game.difficulty);
        const move = analysis.best_move;
        if (!(0, shared_1.isLegalMove)(game.state, move))
            throw new common_1.InternalServerErrorException(`Inference returned illegal move [${move}] — possible state encoding mismatch`);
        game.state = (0, shared_1.applyMove)(game.state, move);
        game.lastAnalysis = analysis;
        return game;
    }
    getAnalysis(id) {
        const game = this.findById(id);
        if (!game.lastAnalysis)
            throw new common_1.BadRequestException('No analysis available yet — the AI needs to make at least one move first.');
        return this.buildAnalysis(game.lastAnalysis, game.state);
    }
    async getXAnalysis(id, sims = 800) {
        const game = this.findById(id);
        if ((0, shared_1.isTerminal)(game.state))
            throw new common_1.BadRequestException('Game is already over');
        if (game.state.player !== 1)
            throw new common_1.BadRequestException('Not X\'s turn');
        const raw = await this.inferenceService.getMove(game.state, sims, game.difficulty);
        return this.buildAnalysis(raw, game.state, true);
    }
    getHintContext(id) {
        const game = this.findById(id);
        if (!game.lastAnalysis)
            throw new common_1.BadRequestException('No analysis available yet — the AI needs to make at least one move first.');
        if (game.hintsUsed >= shared_1.HINT_LIMIT)
            throw new common_1.ForbiddenException(`Hint limit reached (${shared_1.HINT_LIMIT} per game).`);
        game.hintsUsed++;
        return {
            state: game.state,
            analysis: this.buildAnalysis(game.lastAnalysis, game.state),
        };
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    /**
     * Single entry-point for turning a raw inference response into a full
     * GameAnalysis.  Both getAnalysis and getHintContext call this so that
     * every consumer always receives the complete enriched struct.
     */
    buildAnalysis(raw, state, forXPlayer = false) {
        const rawCandidates = raw.candidates.map((c) => ({
            move: c.move,
            visits: c.visits,
            visitShare: c.visit_share,
            qValue: c.q_value,
            prior: c.prior,
            isBest: c.is_best,
        }));
        // Raw priors are the network's softmax over all 81 cells, not masked to
        // legal moves, so each legal-move prior is tiny. Renormalize within the
        // candidate set so priors sum to 1.0 and are human-readable as percentages.
        const totalPrior = rawCandidates.reduce((sum, c) => sum + c.prior, 0);
        const candidates = totalPrior > 0
            ? rawCandidates.map(c => ({ ...c, prior: c.prior / totalPrior }))
            : rawCandidates;
        const best = candidates.find((c) => c.isBest);
        const networkValue = raw.value_estimate;
        // search_value is optional for backward compatibility with older inference
        // server versions that pre-date this field.
        const searchValue = raw.search_value ?? networkValue;
        const winProbability = (networkValue + 1) / 2;
        const topMoveVisitShare = best?.visitShare ?? 0;
        const priorOnBestMove = best?.prior ?? 0;
        // When called for X's turn, value is from X's POV: high = X winning.
        // When called after O's move (normal case), value is from O's POV: invert.
        const xWinPct = forXPlayer
            ? Math.round(winProbability * 100)
            : Math.round((1 - winProbability) * 100);
        const positionType = this.classifyPosition(xWinPct, topMoveVisitShare, networkValue, searchValue);
        const pv = raw.principal_variation;
        // forXPlayer: PV[0] is X's recommended move (root player).
        // Normal case: PV[0] is O's move already played; PV[1] is X's response.
        const recommendedMove = forXPlayer
            ? (pv.length >= 1 ? pv[0] : null)
            : (pv.length >= 2 ? pv[1] : null);
        const macroThreats = this.computeMacroThreats(state, recommendedMove);
        const moveStrategy = this.detectMoveStrategy(state, recommendedMove, macroThreats.xWinsMicroBoard);
        const constraintAnalysis = this.detectConstraintAnalysis(state, recommendedMove);
        return {
            bestMove: raw.best_move,
            candidates,
            networkValue,
            searchValue,
            valueEstimate: networkValue,
            winProbability,
            principalVariation: pv,
            simsUsed: raw.sims_used,
            positionType,
            priorOnBestMove,
            topMoveVisitShare,
            macroThreats,
            moveStrategy,
            constraintAnalysis,
        };
    }
    /**
     * Detect the primary tactical pattern of the recommended move.
     * Checks are ordered by priority: immediate threats before positional concepts.
     */
    detectMoveStrategy(state, recommendedMove, xWinsMicroBoard) {
        if (!recommendedMove)
            return 'POSITIONAL';
        const [xMacro, xCell] = recommendedMove;
        const board = state.board;
        const micro = Array.from({ length: 9 }, (_, i) => board[xMacro * 9 + i]);
        if (micro[xCell] !== 0)
            return 'POSITIONAL';
        // IMMEDIATE_WIN — already computed in macroThreats
        if (xWinsMicroBoard)
            return 'IMMEDIATE_WIN';
        // BLOCK — would O win this micro-board if they played here instead?
        const oTest = [...micro];
        oTest[xCell] = -1;
        if (WIN_LINES.some(([a, b, c]) => oTest[a] === -1 && oTest[b] === -1 && oTest[c] === -1))
            return 'BLOCK';
        // FORK — does X playing here create two or more simultaneous winning threats?
        const xTest = [...micro];
        xTest[xCell] = 1;
        const xThreats = WIN_LINES.filter(([a, b, c]) => {
            const v = [xTest[a], xTest[b], xTest[c]];
            return v.filter(x => x === 1).length === 2 && v.filter(x => x === 0).length === 1;
        }).length;
        if (xThreats >= 2)
            return 'FORK';
        // FORK_BLOCK — would O playing here create a fork for O?
        const oFork = [...micro];
        oFork[xCell] = -1;
        const oThreats = WIN_LINES.filter(([a, b, c]) => {
            const v = [oFork[a], oFork[b], oFork[c]];
            return v.filter(x => x === -1).length === 2 && v.filter(x => x === 0).length === 1;
        }).length;
        if (oThreats >= 2)
            return 'FORK_BLOCK';
        if (xCell === 4)
            return 'CENTER_CONTROL';
        if ([0, 2, 6, 8].includes(xCell))
            return 'CORNER_PLAY';
        return 'POSITIONAL';
    }
    /**
     * Analyse the constraint consequence of the recommended move —
     * i.e. which board O is sent to and how favourable that destination is.
     */
    detectConstraintAnalysis(state, recommendedMove) {
        const empty = {
            sendsToFreeMove: false,
            sendsToODanger: false,
            sendsToXStrong: false,
        };
        if (!recommendedMove)
            return empty;
        const [, xCell] = recommendedMove; // destination board = xCell
        const macro = state.macro;
        const board = state.board;
        // Destination already decided → O gets a free move
        if (macro[xCell] !== 0)
            return { ...empty, sendsToFreeMove: true };
        const dest = Array.from({ length: 9 }, (_, i) => board[xCell * 9 + i]);
        // Can O win the destination board in one move?
        const sendsToODanger = dest.some((v, i) => {
            if (v !== 0)
                return false;
            const t = [...dest];
            t[i] = -1;
            return WIN_LINES.some(([a, b, c]) => t[a] === -1 && t[b] === -1 && t[c] === -1);
        });
        // Does X already have a two-in-a-row threat in the destination board?
        const sendsToXStrong = WIN_LINES.some(([a, b, c]) => {
            const v = [dest[a], dest[b], dest[c]];
            return v.filter(x => x === 1).length === 2 && v.filter(x => x === 0).length === 1;
        });
        return { sendsToFreeMove: false, sendsToODanger, sendsToXStrong };
    }
    /* Priority order matters: DESPERATE overrides everything (the losing-position
    * framing should always dominate), FORCED is checked next because a position
    * can be simultaneously forced and tactical, and TACTICAL/STRATEGIC are
    * distinguished by the network-search gap.
    */
    classifyPosition(xWinPct, topMoveVisitShare, networkValue, searchValue) {
        if (xWinPct < 30)
            return 'DESPERATE';
        if (topMoveVisitShare > 0.75)
            return 'FORCED';
        if (Math.abs(networkValue - searchValue) > 0.15)
            return 'TACTICAL';
        return 'STRATEGIC';
    }
    /**
     * Compute macro-level threat flags using the current game state and the
     * recommended move (PV[1]).
     *
     * All checks use pure game-rule logic — no network inference required.
     * player=1 is X (the human player whose recommended move we are analysing).
     */
    computeMacroThreats(state, recommendedMove) {
        const empty = {
            xWinsMicroBoard: false,
            xCreatesMacroThreat: false,
            oHasMacroThreat: false,
            blocksOThreat: false,
        };
        if (!recommendedMove)
            return empty;
        const [xMacro, xCell] = recommendedMove;
        const board = state.board;
        const macro = state.macro;
        // 1. Would placing X at (xMacro, xCell) win the micro-board?
        const testBoard = [...board];
        testBoard[xMacro * 9 + xCell] = 1; // 1 = X
        const micro = testBoard.slice(xMacro * 9, xMacro * 9 + 9);
        const xWinsMicroBoard = WIN_LINES.some(([a, b, c]) => micro[a] === 1 && micro[b] === 1 && micro[c] === 1);
        // 2. Winning that micro-board: does X get two-in-a-row at the macro level?
        let xCreatesMacroThreat = false;
        if (xWinsMicroBoard) {
            const testMacro = [...macro];
            testMacro[xMacro] = 1;
            xCreatesMacroThreat = WIN_LINES.some(([a, b, c]) => {
                const v = [testMacro[a], testMacro[b], testMacro[c]];
                return v.filter(x => x === 1).length === 2 &&
                    v.filter(x => x === 0).length === 1;
            });
        }
        // 3. Does O currently have two-in-a-row at the macro level?
        const oHasMacroThreat = WIN_LINES.some(([a, b, c]) => {
            const v = [macro[a], macro[b], macro[c]];
            return v.filter(x => x === -1).length === 2 &&
                v.filter(x => x === 0).length === 1;
        });
        // 4. Would winning xMacro remove O's macro threat?
        let blocksOThreat = false;
        if (xWinsMicroBoard && oHasMacroThreat) {
            const testMacro = [...macro];
            testMacro[xMacro] = 1;
            const oStillThreatens = WIN_LINES.some(([a, b, c]) => {
                const v = [testMacro[a], testMacro[b], testMacro[c]];
                return v.filter(x => x === -1).length === 2 &&
                    v.filter(x => x === 0).length === 1;
            });
            blocksOThreat = !oStillThreatens;
        }
        return { xWinsMicroBoard, xCreatesMacroThreat, oHasMacroThreat, blocksOThreat };
    }
};
exports.GamesService = GamesService;
exports.GamesService = GamesService = GamesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [inference_service_1.InferenceService])
], GamesService);
//# sourceMappingURL=games.service.js.map