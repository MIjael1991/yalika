import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';

import { PresenteMercadoPagoService } from './presente-mercadopago.service';

/**
 * Avisos automáticos que mandan otros servicios (sin sesión de Yalika). No se confía en lo que
 * traen: el servicio de Mercado Pago confirma cada pago preguntándole directo a Mercado Pago.
 */
@Controller('presente/webhooks')
export class PresenteWebhooksController {
  constructor(private readonly mercadoPago: PresenteMercadoPagoService) {}

  @Post('mercadopago')
  @HttpCode(200)
  mercadoPagoNotice(
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    return this.mercadoPago.webhook(query, body);
  }
}
