/**
 * Bundles everything related to game sessions: the controller (HTTP
 * surface), the service (in-memory storage and game logic delegation),
 * and any future helpers. Imported by `AppModule` to bring `/games/*`
 * routes into the application.
 *
 * `InferenceModule` is imported here so that `InferenceService` is
 * injectable inside this module's providers (specifically `GamesService`).
 */
export declare class GamesModule {
}
