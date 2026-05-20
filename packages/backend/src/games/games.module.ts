import { Module } from '@nestjs/common';
import { InferenceModule } from '../inference/inference.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

/**
 * Bundles everything related to game sessions: the controller (HTTP
 * surface), the service (in-memory storage and game logic delegation),
 * and any future helpers. Imported by `AppModule` to bring `/games/*`
 * routes into the application.
 *
 * `InferenceModule` is imported here so that `InferenceService` is
 * injectable inside this module's providers (specifically `GamesService`).
 */
@Module({
  imports: [InferenceModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}