import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './prompt-builder';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly client: Anthropic;

  constructor() {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is not set. ' +
        'Add it to packages/backend/.env',
      );
    }
    this.client = new Anthropic({ apiKey });
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
  async *streamHint(prompt: string): AsyncGenerator<string> {
    this.logger.log('Streaming hint from Claude Haiku...');

    const stream = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    let totalTokens = 0;
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
        totalTokens++;
      }

      // Log final usage once the stream closes
      if (event.type === 'message_delta' && event.usage) {
        this.logger.log(
          `Hint complete — output tokens: ${event.usage.output_tokens}`,
        );
      }
    }
  }
}