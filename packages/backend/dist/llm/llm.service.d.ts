export declare class LLMService {
    private readonly logger;
    private readonly client;
    constructor();
    /**
     * Stream a hint explanation from Claude Haiku.
     *
     * Yields plain text tokens as they arrive so the controller can forward
     * them to the frontend via Server-Sent Events without buffering the full
     * response first.
     *
     * @param prompt  The formatted game context from buildHintPrompt().
     */
    streamHint(prompt: string): AsyncGenerator<string>;
}
