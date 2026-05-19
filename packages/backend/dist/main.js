"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
/**
 * Bootstraps the Nest application: creates the dependency-injection container,
 * wires up controllers, and starts the HTTP server.
 */
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    // Permissive CORS so the Vite dev server (different port) can call us.
    // Tighten allowed origins for production.
    app.enableCors();
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port);
    console.log(`[backend] Listening on http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map