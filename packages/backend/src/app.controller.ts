import { Controller, Get } from '@nestjs/common';
// health-check controller so we can verify the server is alive
@Controller()
export class AppController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}