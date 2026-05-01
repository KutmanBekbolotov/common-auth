import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'common-auth',
      status: 'ok',
    };
  }
}
