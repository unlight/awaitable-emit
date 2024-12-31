import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  shared: any[] = [];
  getHello(): string {
    return 'Hello World! ' + new Date();
  }
}
