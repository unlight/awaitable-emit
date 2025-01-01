import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { setTimeout } from 'node:timers/promises';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @EventPattern('user-created')
  async handleEntityCreated(@Payload() payload: object) {
    console.log('user created', payload);
    await setTimeout(2000); // Imitate long running process
    this.appService.shared.push(payload);
  }
}
