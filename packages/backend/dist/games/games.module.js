"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamesModule = void 0;
const common_1 = require("@nestjs/common");
const inference_module_1 = require("../inference/inference.module");
const games_controller_1 = require("./games.controller");
const games_service_1 = require("./games.service");
const llm_module_1 = require("../llm/llm.module");
/**
 * Bundles everything related to game sessions: the controller (HTTP
 * surface), the service (in-memory storage and game logic delegation),
 * and any future helpers. Imported by `AppModule` to bring `/games/*`
 * routes into the application.
 *
 * `InferenceModule` is imported here so that `InferenceService` is
 * injectable inside this module's providers (specifically `GamesService`).
 */
let GamesModule = class GamesModule {
};
exports.GamesModule = GamesModule;
exports.GamesModule = GamesModule = __decorate([
    (0, common_1.Module)({
        imports: [inference_module_1.InferenceModule, llm_module_1.LLMModule],
        controllers: [games_controller_1.GamesController],
        providers: [games_service_1.GamesService],
    })
], GamesModule);
//# sourceMappingURL=games.module.js.map