import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { GamesModule } from './games/games.module';
import { ConfigModule } from '@nestjs/config';

/**
 * Root module of the application. Modules are NestJS's unit of organization:
 * they bundle together the controllers, providers (services), and any
 * sub-modules that belong to a feature.
 *
 * `GamesModule` is imported here so its controller's routes are mounted on
 * the application. The DI container also walks imported modules to satisfy
 * dependencies across module boundaries.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GamesModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}