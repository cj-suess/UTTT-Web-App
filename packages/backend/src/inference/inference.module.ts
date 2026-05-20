import { Module } from '@nestjs/common';
import { InferenceService } from './inference.service';

/**
 * Provides and exports `InferenceService` so that any module importing
 * `InferenceModule` can inject it into their own providers.
 *
 * The `exports` array is what distinguishes "available within this module"
 * from "available to modules that import this one". Without it, NestJS's DI
 * boundary would prevent GamesService from resolving InferenceService.
 */
@Module({
  providers: [InferenceService],
  exports: [InferenceService],
})
export class InferenceModule {}