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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var LLMService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMService = void 0;
const common_1 = require("@nestjs/common");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const prompt_builder_1 = require("./prompt-builder");
let LLMService = LLMService_1 = class LLMService {
    logger = new common_1.Logger(LLMService_1.name);
    client;
    constructor() {
        const apiKey = process.env['ANTHROPIC_API_KEY'];
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY environment variable is not set. ' +
                'Add it to packages/backend/.env');
        }
        this.client = new sdk_1.default({ apiKey });
    }
    /**
     * Stream a hint explanation from Claude Haiku.
     *
     * Yields plain text tokens as they arrive so the controller can forward
     * them to the frontend via Server-Sent Events without buffering the full
     * response first.
     *
     * @param prompt  The formatted game context from buildHintPrompt().
     */
    async *streamHint(prompt) {
        this.logger.log('Streaming hint from Claude Haiku...');
        const stream = await this.client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            system: prompt_builder_1.SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
        });
        let totalTokens = 0;
        for await (const event of stream) {
            if (event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta') {
                yield event.delta.text;
                totalTokens++;
            }
            // Log final usage once the stream closes
            if (event.type === 'message_delta' && event.usage) {
                this.logger.log(`Hint complete — output tokens: ${event.usage.output_tokens}`);
            }
        }
    }
};
exports.LLMService = LLMService;
exports.LLMService = LLMService = LLMService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], LLMService);
//# sourceMappingURL=llm.service.js.map