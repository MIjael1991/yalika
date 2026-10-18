import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { isCashier } from '../../auth/tenant-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { grantedMayCall } from './cashier-grants';
import { cashierMayCall } from './cashier-policy';

/** R6: controles en backend, independientes de botones o IDs enviados por el cliente. */
export const commercePrivateRoots = new Set([
  'catalog',
  'site',
  'site-team',
  'promotion',
  'inventory',
  'order',
  'payment',
  'return',
  'discount',
  'order-split',
  'customer',
  'loyalty-program',
  'dining-table',
  'recipe',
  'operations',
  'media',
  'engagement',
  'scratch',
  'business-assistant',
]);

const relatedIds: Record<
  string,
  { model: string; relation?: 'product' | 'order' | 'return' }
> = {
  siteId: { model: 'site' },
  categoryId: { model: 'productCategory' },
  productId: { model: 'product' },
  variantId: { model: 'productVariant', relation: 'product' },
  imageId: { model: 'productImage', relation: 'product' },
  orderId: { model: 'order' },
  exchangeOrderId: { model: 'order' },
  orderItemId: { model: 'orderItem', relation: 'order' },
  orderSplitId: { model: 'orderSplit', relation: 'order' },
  paymentId: { model: 'payment' },
  promotionId: { model: 'promotion' },
  customerId: { model: 'customer' },
  loyaltyProgramId: { model: 'loyaltyProgram' },
  inventoryItemId: { model: 'inventoryItem' },
  itemId: { model: 'inventoryItem' },
  supplierId: { model: 'supplier' },
  tableId: { model: 'diningTable' },
  returnId: { model: 'return' },
  discountId: { model: 'orderDiscount', relation: 'order' },
  receiptId: { model: 'stockReceipt' },
  barcodeId: { model: 'productBarcode' },
};

const primaryResource: Record<string, string> = {
  site: 'siteId',
  order: 'orderId',
  return: 'returnId',
  promotion: 'promotionId',
  discount: 'discountId',
  'loyalty-program': 'loyaltyProgramId',
  'dining-table': 'tableId',
};

const actorIds = new Set(['authorizedById', 'processedById', 'voidedById']);

type Lookup = {
  findUnique: (query: unknown) => Promise<unknown>;
};

@Injectable()
export class CommerceAccessGuard implements CanActivate {
  constructor(
    private readonly sessionGuard: SessionAuthGuard,
    private readonly prisma: PrismaService,
  ) {}

  private async assertOwner(
    key: string,
    value: string,
    companyId: string,
  ): Promise<void> {
    const target = relatedIds[key];
    if (!target) {
      throw new ForbiddenException('Recurso comercial no autorizado');
    }
    const model = (this.prisma as unknown as Record<string, Lookup>)[
      target.model
    ];
    if (!model || typeof model.findUnique !== 'function') {
      throw new ForbiddenException('No se pudo verificar el recurso');
    }
    const select = target.relation
      ? { [target.relation]: { select: { companyId: true } } }
      : { companyId: true };
    const found = (await model.findUnique({
      where: { id: value },
      select,
    })) as Record<string, unknown> | null;
    if (!found) {
      throw new NotFoundException('El recurso no existe');
    }
    const owner = target.relation
      ? (found[target.relation] as { companyId?: string } | null)?.companyId
      : found.companyId;
    if (owner !== companyId) {
      // No revelar datos de empresas ajenas.
      throw new NotFoundException('El recurso no existe');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const parts = req.path.split('/').filter(Boolean);
    const root = parts[0];
    if (!commercePrivateRoots.has(root)) return true; // Nunca cambia Encuestas ni el Cerebro.

    const publicRoute =
      (req.method === 'GET' &&
        ((root === 'site' && parts[1] === 'public' && parts.length === 3) ||
          (root === 'catalog' &&
            parts[1] === 'public' &&
            parts[2] === 'company' &&
            parts.length === 4) ||
          (root === 'promotion' &&
            parts[1] === 'public' &&
            parts[2] === 'company' &&
            parts.length === 4) ||
          (root === 'media' && parts[1] === 'image' && parts.length === 3))) ||
      (root === 'scratch' &&
        req.method === 'POST' &&
        parts[1] === 'public' &&
        parts.length === 4 &&
        parts[3] === 'play') ||
      (root === 'engagement' &&
        parts[1] === 'public' &&
        ((req.method === 'GET' && parts.length === 3) ||
          (req.method === 'POST' &&
            parts.length === 4 &&
            ['join', 'check-in', 'claim-ticket'].includes(parts[3]))));
    if (publicRoute) return true;

    await this.sessionGuard.canActivate(context);
    if (!req.auth.user.modules?.includes('all')) {
      throw new ForbiddenException(
        'No tienes permiso para este servicio comercial',
      );
    }
    const companyId = req.auth.user.companyId;
    if (!companyId)
      throw new ForbiddenException('La cuenta no tiene empresa activa');

    // El cajero solo vende y cobra; lo demás es del administrador.
    if (
      isCashier(req.auth) &&
      !cashierMayCall(req.method, parts, req.body as Record<string, unknown>) &&
      !grantedMayCall(req.auth.user.permissions, req.method, parts)
    ) {
      throw new ForbiddenException(
        'Esta operación es solo para el administrador',
      );
    }

    // Listados de clientes y operaciones se filtran en sus controladores y servicios.

    const visited = new Set<string>();
    let checked = 0;
    const assertId = async (key: string, value: unknown): Promise<void> => {
      if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException('Identificador comercial inválido');
      }
      const identifier = `${key}:${value}`;
      if (visited.has(identifier)) return;
      visited.add(identifier);
      checked++;
      if (checked > 250)
        throw new BadRequestException('Demasiados artículos en una solicitud');
      await this.assertOwner(key, value, companyId);
    };

    const scan = async (value: unknown, depth = 0): Promise<void> => {
      if (!value || typeof value !== 'object' || depth > 5) return;
      if (Array.isArray(value)) {
        for (const item of value) await scan(item, depth + 1);
        return;
      }
      for (const [key, entry] of Object.entries(value)) {
        if (key === 'companyId') {
          if (entry !== companyId) {
            throw new ForbiddenException(
              'Esta empresa no corresponde a tu sesión',
            );
          }
        } else if (actorIds.has(key)) {
          if (entry !== req.auth.user.id) {
            throw new ForbiddenException(
              'El operador debe coincidir con la sesión',
            );
          }
        } else if (relatedIds[key] && entry != null) {
          await assertId(key, entry);
        } else if (entry !== null && typeof entry === 'object') {
          await scan(entry, depth + 1);
        }
      }
    };

    await scan(req.params);
    await scan(req.body);
    // Las consultas también pueden indicar empresa o recurso.
    await scan(req.query);

    // El parámetro genérico :id representa entidades distintas según la ruta.
    const id = req.params?.id;
    if (typeof id === 'string') {
      const primary =
        root === 'catalog'
          ? parts[1] === 'variant'
            ? 'variantId'
            : parts[1] === 'product'
              ? 'productId'
              : ''
          : (primaryResource[root] ?? '');
      if (!primary)
        throw new ForbiddenException('Ruta comercial sin alcance definido');
      await assertId(primary, id);
    }
    return true;
  }
}
