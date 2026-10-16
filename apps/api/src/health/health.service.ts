import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus() {
    return {
      name: 'Yalika',
      status: 'online',
      version: '0.0.1',
    };
  }
}
