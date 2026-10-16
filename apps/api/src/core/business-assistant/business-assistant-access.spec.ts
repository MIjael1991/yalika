import { WritingAssistant } from './writing-assistant';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BusinessAssistantController } from './business-assistant.controller';
import { BusinessAssistantService } from './business-assistant.service';
import { AuthService } from '../../auth/auth.service';
import { SessionAuthGuard } from '../../auth/session-auth.guard';

describe('R8.2 sesión del asistente comercial', () => {
  let app: INestApplication;
  const interpret = jest.fn().mockResolvedValue({ mode: 'answer' });
  const user = { id: 'u1', companyId: 'c1', modules: ['all'] };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BusinessAssistantController],
      providers: [WritingAssistant,SessionAuthGuard,
        { provide: BusinessAssistantService, useValue: { interpret } },
        { provide: AuthService, useValue: { authenticate: jest.fn(async (token: string) => {
          if (token !== 'valid') throw new UnauthorizedException();
          return { user };
        }) } },
      ],
    }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => interpret.mockClear());
  it('rechaza peticiones sin sesión antes de invocar el motor', async () => {
    await request(app.getHttpServer()).post('/business-assistant/interpret').send({ text: 'ventas' }).expect(401);
    expect(interpret).not.toHaveBeenCalled();
  });
  it('protege la ayuda de escritura sin sesión', async () => {
    await request(app.getHttpServer()).post('/business-assistant/writing').send({text:'hola mundo',action:'spelling',consent:true}).expect(401);
  });
  it('rechaza una sesión inválida', async () => {
    await request(app.getHttpServer()).post('/business-assistant/interpret').set('Cookie', 'orion_session=invalid').send({ text: 'ventas' }).expect(401);
    expect(interpret).not.toHaveBeenCalled();
  });
  it('usa la identidad autenticada y no la compañía del cuerpo', async () => {
    const body = { text: 'ventas', context: { companyId: 'otra' } };
    await request(app.getHttpServer()).post('/business-assistant/interpret').set('Cookie', 'orion_session=valid').send(body).expect(201);
    expect(interpret).toHaveBeenCalledWith(body, user);
  });
});
