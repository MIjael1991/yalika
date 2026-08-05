import { Injectable } from '@nestjs/common';

@Injectable()
export class CompanyService {

  getInfo() {
    return {
      id: 1,
      name: 'ORION Technologies',
      version: '0.0.1',
      status: 'active'
    };
  }

}