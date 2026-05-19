/**
 * Top-level health-check controller. Exists mainly to give us something to
 * curl when verifying the server is alive.
 *
 * The `@Controller()` decorator (no path) means routes here are mounted at
 * the application root. `@Get('health')` registers a handler for
 * `GET /health`. NestJS reads these decorators at startup and builds the
 * routing table — there's no manual `app.get(...)` like in Express.
 */
export declare class AppController {
    health(): {
        status: string;
    };
}
