import { Module } from '@nestjs/common';
import { InferenceService } from './inference.service';

@Module({
  providers: [InferenceService],
  exports: [InferenceService], // export so modules importing InferenceModule can inject into their providers
})
export class InferenceModule {}