import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  healthCheck(): { message: string } {
    return {
      message: 'OK',
    };
  }
}
