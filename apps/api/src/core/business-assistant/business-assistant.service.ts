import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { InterpretBusinessAssistantDto, SaveBusinessMemoryDto } from './dto/business-assistant.dto';

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

@Injectable()
export class BusinessAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  private requireAccess(user: AuthenticatedUser) {
    if (!user?.id || !user.companyId || !user.modules?.includes('all')) throw new ForbiddenException('No tienes acceso al asistente comercial');
  }

  async listMemory(user: AuthenticatedUser) {
    this.requireAccess(user);
    return this.prisma.businessAssistantMemory.findMany({
      where: { userId: user.id, companyId: user.companyId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async saveMemory(dto: SaveBusinessMemoryDto, user: AuthenticatedUser) {
    this.requireAccess(user);
    const scope = dto.scope.trim().toLowerCase();
    const key = dto.key.trim().toLowerCase();
    if (!scope || !key) throw new BadRequestException('Memoria inválida');
    return this.prisma.businessAssistantMemory.upsert({
      where: { userId_scope_key: { userId: user.id, scope, key } },
      create: { scope, key, value: dto.value as any, userId: user.id, companyId: user.companyId },
      update: { value: dto.value as any, source: 'user_confirmed', status: 'active' },
    });
  }

  async interpret(dto: InterpretBusinessAssistantDto, user: AuthenticatedUser) {
    this.requireAccess(user);
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Escribe qué necesitas');
    const lower = normalized(text);

    const margin = lower.match(/(?:margen|ganancia)\s+(?:habitual\s+)?(?:es\s+)?(?:de\s+)?(\d{1,3}(?:\.\d+)?)\s*%/);
    if (margin) {
      const value = Number(margin[1]);
      if (value >= 0 && value <= 500) {
        return {
          mode: 'proposal', intent: 'remember_margin', risk: 'medium', requiresConfirmation: true,
          message: `Entendí que tu margen habitual es ${value}%. ¿Quieres que lo recuerde como preferencia?`,
          memoryDraft: { scope: 'commerce', key: 'default_margin_percent', value: { percent: value } },
        };
      }
    }

    if (/(poco|bajo|faltan|reponer|existencia)/.test(lower) && /(producto|inventario|stock|mercancia)/.test(lower)) {
      const products = await this.prisma.product.findMany({
        where: { companyId: user.companyId, status: 'active', trackInventory: true },
        select: { id: true, name: true, stock: true, lowStockAt: true, variants: { select: { name: true, stock: true, status: true } } },
        orderBy: { name: 'asc' },
      });
      const low = products.flatMap((product) => {
        if (product.variants.length) {
          return product.variants.filter(v => v.status === 'active' && v.stock <= product.lowStockAt)
            .map(v => ({ productId: product.id, name: `${product.name} · ${v.name}`, stock: v.stock, lowStockAt: product.lowStockAt }));
        }
        return product.stock <= product.lowStockAt ? [{ productId: product.id, name: product.name, stock: product.stock, lowStockAt: product.lowStockAt }] : [];
      }).slice(0, 25);
      return { mode: 'answer', intent: 'low_stock', risk: 'low', requiresConfirmation: false,
        message: low.length ? `Encontré ${low.length} artículos en nivel bajo.` : 'No encontré artículos activos por debajo de su nivel mínimo.', items: low };
    }

    if (/(vendi|ventas|cobre|cobrado)/.test(lower) && /(hoy|dia)/.test(lower)) {
      const start = new Date(); start.setHours(0,0,0,0);
      const orders = await this.prisma.order.findMany({
        where: { companyId: user.companyId, createdAt: { gte: start }, paymentStatus: 'paid' },
        select: { total: true },
      });
      const total = Math.round(orders.reduce((sum, order) => sum + order.total, 0) * 100) / 100;
      return { mode: 'answer', intent: 'sales_today', risk: 'low', requiresConfirmation: false,
        message: `Hoy hay ${orders.length} ventas pagadas por un total de $${total.toFixed(2)}.`, data: { count: orders.length, total } };
    }

    const receive = lower.match(/(?:llegaron|recibi|recibimos|entrada)\s+(\d+)\s+cajas?.*?(\d+)\s+(?:piezas?|unidades?)/);
    if (receive) {
      const boxes = Number(receive[1]); const unitsPerBox = Number(receive[2]);
      const cost = lower.match(/(?:costo|costaron|pague|pagamos)\s+(?:de\s+)?\$?\s*(\d+(?:[.,]\d+)?)/);
      const totalUnits = boxes * unitsPerBox;
      return {
        mode: 'proposal', intent: 'inventory_receive', risk: 'high', requiresConfirmation: true,
        message: cost
          ? `Entendí ${boxes} cajas × ${unitsPerBox} = ${totalUnits} unidades y detecté $${cost[1]} como costo. Antes de registrar necesito saber si ese costo es por caja o por toda la compra y qué producto es.`
          : `Entendí ${boxes} cajas × ${unitsPerBox} = ${totalUnits} unidades. Falta identificar el producto y, si quieres, el costo por caja.`,
        draft: { boxes, unitsPerBox, totalUnits, costMention: cost?.[1] ?? null },
        missing: ['product', ...(cost ? ['costMeaning'] : [])],
      };
    }

    if (/(pagina|sitio|web|portada|banner|tiktok|video)/.test(lower) && /(crea|haz|cambia|quiero|disena|diseña)/.test(lower)) {
      return {
        mode: 'proposal', intent: 'site_design', risk: 'medium', requiresConfirmation: true,
        message: 'Puedo preparar el cambio como borrador. No publicaré nada sin tu aprobación.',
        draft: { request: text, suggestedSections: ['hero', 'banner', 'catalog', 'video', 'contact'] },
      };
    }

    const products = await this.prisma.product.findMany({
      where: { companyId: user.companyId, status: 'active', name: { contains: text, mode: 'insensitive' } },
      select: { id: true, name: true, price: true, stock: true, sku: true, unitCost: true }, take: 8,
    });
    if (products.length) {
      return { mode: 'answer', intent: 'product_search', risk: 'low', requiresConfirmation: false,
        message: `Encontré ${products.length} coincidencia${products.length === 1 ? '' : 's'}.`, items: products };
    }

    return {
      mode: 'clarify', intent: 'unknown', risk: 'low', requiresConfirmation: false,
      message: 'No quiero adivinar. Puedes pedirme, por ejemplo: “qué productos están bajos”, “cuánto vendí hoy”, “llegaron 5 cajas de 24 piezas” o “haz una portada con video”.',
    };
  }
}
