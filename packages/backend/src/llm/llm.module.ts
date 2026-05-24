import { Module } from '@nestjs/common';
import { LLMService } from './llm.service';

/**
 * Provides LLMService to any module that imports LLMModule.
 * The exports array is what makes LLMService injectable in GamesModule.
 */
@Module({
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {}