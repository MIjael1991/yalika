'use client';

import Link from 'next/link';
import { BarcodeScanner } from './barcode-scanner';
import QRCode from 'qrcode';

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ProductVariant = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  status: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  catalogId?: string | null;
  price: number;
  stock: number;
  status: string;
  trackInventory: boolean;
  featured: boolean;
  category: {
    id: string;
    name: string;
  } | null;
  variants: ProductVariant[];
};

type SaleOption = {
  key: string;
  productId: string;
  variantId?: string;
  productName: string;
  catalogId?: string;
  variantName?: string;
  categoryId?: string;
  categoryName: string;
  sku?: string;
  price: number;
  stock: number;
  trackInventory: boolean;
  featured: boolean;
};

type DiscountType = 'percentage' | 'fixed' | 'special_price';

type CartDiscount = {
  type: DiscountType;
  value: number;
  reason: string;
  source?: 'manual' | 'promotion';
  promotionId?: string;
};

type CartItem = SaleOption & {
  quantity: number;
  discount?: CartDiscount;
};

type OrderItem = {
  id: string;
  productId: string;
  variantId: string | null;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  discount: number;
  total: number;
  items: OrderItem[];
};

type CheckoutSession = {
  order: Order;
  appliedDiscountKeys: string[];
  discountOperationIds: Record<string, string>;
  confirmed: boolean;
};

type PaymentResult = {
  payment: {
    id: string;
    method: string;
    amount: number;
    receivedAmount: number | null;
    changeAmount: number;
  };
  order: {
    id: string;
    orderNumber: string;
    total: number;
    paymentStatus: string;
  };
  summary: {
    totalPaid: number;
    remaining: number;
    changeAmount: number;
  };
  split: {
    id: string;
    label: string;
    total: number;
    totalPaid: number;
    remaining: number;
    status: string;
  } | null;
  loyalty: {
    confirmedVisits: number;
    requiredVisits: number;
    remainingVisits: number;
    rewardCreated: boolean;
  } | null;
  benefitClaim: {
    siteSlug: string;
    orderId: string;
    token: string;
  } | null;
};

type CustomerIdentityResult = {
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  program: {
    id: string;
    name: string;
    requiredVisits: number;
    rewardDescription: string;
  } | null;
};

type BarcodeResolution = {
  value: string;
  unitsPerScan: number;
  product: Product;
  variant: ProductVariant | null;
};

type OrderSplit = {
  id: string;
  label: string;
  mode: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
};

type EqualSplitResult = {
  orderId: string;
  orderTotal: number;
  mode: string;
  parts: number;
  splits: OrderSplit[];
};

type SplitEditor = {
  parts: string;
  error: string;
};

type SplitCheckout = {
  order: Order;
  items: CartItem[];
  splits: OrderSplit[];
  payments: PaymentResult[];
};

type DiscountResult = {
  order: Order;
};

type ConfirmationResult = {
  order: Order;
};

type Receipt = {
  order: Order;
  payment: PaymentResult;
  items: CartItem[];
};

type ReturnRecord = {
  id: string;
  returnNumber: string;
  status: string;
};

type ConfirmReturnResult = {
  return: ReturnRecord;
};

type DiscountEditor = {
  targetKey: 'order' | string;
  label: string;
  type: DiscountType;
  value: string;
  reason: string;
  error: string;
};

type QuickProductEditor = {
  name: string;
  sku: string;
  type: 'product' | 'service' | 'food' | 'beverage' | 'design';
  price: string;
  trackInventory: boolean;
  stock: string;
  categoryId: string;
  error: string;
};

export type ActivePromotion = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  scope: string;
  discountValue: number | null;
  specialPrice: number | null;
  minimumPurchase: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  featured: boolean;
  startsAt: string;
  endsAt: string;
  products: Array<{
    productId: string;
  }>;
};

type PromotionPlan = {
  promotion: ActivePromotion;
  savings: number;
  orderDiscount?: CartDiscount;
  itemDiscounts: Record<string, CartDiscount>;
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function toCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(value: number) {
  return value / 100;
}

function getErrorMessage(value: unknown) {
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message: unknown }).message;

    if (Array.isArray(message)) {
      return message.join('. ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return 'No fue posible completar la operación';
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/yalika/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = await response.text();
  let payload: unknown = {};

  if (body) {
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      payload = { message: body };
    }
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }

  return payload as T;
}

function getSaleOptions(products: Product[]) {
  return products.flatMap<SaleOption>((product) => {
    const activeVariants = product.variants.filter(
      (variant) => variant.status === 'active',
    );

    if (activeVariants.length > 0) {
      return activeVariants.map((variant) => ({
        key: `${product.id}:${variant.id}`,
        productId: product.id,
        catalogId: product.catalogId ?? undefined,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        categoryId: product.category?.id,
        categoryName: product.category?.name ?? 'Sin categoría',
        sku: variant.sku ?? product.sku ?? undefined,
        price: variant.price ?? product.price,
        stock: variant.stock,
        trackInventory: product.trackInventory,
        featured: product.featured,
      }));
    }

    return [
      {
        key: product.id,
        productId: product.id,
        catalogId: product.catalogId ?? undefined,
        productName: product.name,
        categoryId: product.category?.id,
        categoryName: product.category?.name ?? 'Sin categoría',
        sku: product.sku ?? undefined,
        price: product.price,
        stock: product.stock,
        trackInventory: product.trackInventory,
        featured: product.featured,
      },
    ];
  });
}

function calculateDiscountCents(
  discount: CartDiscount | undefined,
  baseCents: number,
  quantity = 1,
) {
  if (!discount) {
    return 0;
  }

  if (discount.type === 'percentage') {
    return Math.min(
      Math.round((baseCents * discount.value) / 100),
      baseCents,
    );
  }

  if (discount.type === 'fixed') {
    return Math.min(toCents(discount.value), baseCents);
  }

  return Math.max(baseCents - toCents(discount.value) * quantity, 0);
}

function getCartTotals(cart: CartItem[], orderDiscount?: CartDiscount) {
  const subtotalCents = cart.reduce(
    (total, item) => total + toCents(item.price * item.quantity),
    0,
  );
  const itemDiscountCents = cart.reduce((total, item) => {
    const lineCents = toCents(item.price * item.quantity);
    return (
      total +
      calculateDiscountCents(item.discount, lineCents, item.quantity)
    );
  }, 0);
  const afterItemsCents = subtotalCents - itemDiscountCents;
  const orderDiscountCents = calculateDiscountCents(
    orderDiscount,
    afterItemsCents,
  );

  return {
    subtotal: fromCents(subtotalCents),
    discount: fromCents(itemDiscountCents + orderDiscountCents),
    total: fromCents(afterItemsCents - orderDiscountCents),
  };
}

function buildPromotionPlan(
  promotion: ActivePromotion,
  cart: CartItem[],
): PromotionPlan | null {
  if (
    ![
      'percentage',
      'fixed',
      'special_price',
      'buy_x_get_y',
    ].includes(promotion.type) ||
    cart.length === 0
  ) {
    return null;
  }

  const baseCents = cart.reduce(
    (total, item) =>
      total + toCents(item.price * item.quantity),
    0,
  );

  if (
    promotion.minimumPurchase &&
    fromCents(baseCents) < promotion.minimumPurchase
  ) {
    return null;
  }

  const reason = `Promoción: ${promotion.title}`;

  if (promotion.type === 'buy_x_get_y') {
    if (
      promotion.scope !== 'selected_products' ||
      !promotion.buyQuantity ||
      !promotion.getQuantity
    ) {
      return null;
    }

    const productIds = new Set(
      promotion.products.map((item) => item.productId),
    );
    const itemDiscounts: Record<string, CartDiscount> = {};
    let savingsCents = 0;

    for (const item of cart.filter((cartItem) =>
      productIds.has(cartItem.productId),
    )) {
      const groupSize =
        promotion.buyQuantity + promotion.getQuantity;
      const freeUnits =
        Math.floor(item.quantity / groupSize) *
        promotion.getQuantity;
      const itemSavingsCents =
        toCents(item.price) * freeUnits;

      if (itemSavingsCents > 0) {
        itemDiscounts[item.key] = {
          type: 'fixed',
          value: fromCents(itemSavingsCents),
          reason,
          source: 'promotion',
          promotionId: promotion.id,
        };
        savingsCents += itemSavingsCents;
      }
    }

    return savingsCents > 0
      ? {
          promotion,
          savings: fromCents(savingsCents),
          itemDiscounts,
        }
      : null;
  }

  const type = promotion.type as DiscountType;
  const value =
    type === 'special_price'
      ? promotion.specialPrice
      : promotion.discountValue;

  if (value === null || value === undefined || value < 0) {
    return null;
  }

  const makeDiscount = (): CartDiscount => ({
    type,
    value,
    reason,
    source: 'promotion',
    promotionId: promotion.id,
  });

  if (promotion.scope !== 'selected_products') {
    if (type === 'special_price') {
      return null;
    }

    const discount = makeDiscount();
    const savingsCents = calculateDiscountCents(
      discount,
      baseCents,
    );

    return savingsCents > 0
      ? {
          promotion,
          savings: fromCents(savingsCents),
          orderDiscount: discount,
          itemDiscounts: {},
        }
      : null;
  }

  const productIds = new Set(
    promotion.products.map((item) => item.productId),
  );
  const eligibleItems = cart.filter((item) =>
    productIds.has(item.productId),
  );

  if (eligibleItems.length === 0) {
    return null;
  }

  if (type === 'fixed') {
    const bestItem = eligibleItems.reduce(
      (best, item) => {
        const savings = calculateDiscountCents(
          makeDiscount(),
          toCents(item.price * item.quantity),
          item.quantity,
        );
        const bestSavings = calculateDiscountCents(
          makeDiscount(),
          toCents(best.price * best.quantity),
          best.quantity,
        );

        return savings > bestSavings ? item : best;
      },
    );
    const discount = makeDiscount();
    const savingsCents = calculateDiscountCents(
      discount,
      toCents(bestItem.price * bestItem.quantity),
      bestItem.quantity,
    );

    return savingsCents > 0
      ? {
          promotion,
          savings: fromCents(savingsCents),
          itemDiscounts: {
            [bestItem.key]: discount,
          },
        }
      : null;
  }

  const itemDiscounts: Record<string, CartDiscount> = {};
  let savingsCents = 0;

  for (const item of eligibleItems) {
    const discount = makeDiscount();
    const itemSavings = calculateDiscountCents(
      discount,
      toCents(item.price * item.quantity),
      item.quantity,
    );

    if (itemSavings > 0) {
      itemDiscounts[item.key] = discount;
      savingsCents += itemSavings;
    }
  }

  return savingsCents > 0
    ? {
        promotion,
        savings: fromCents(savingsCents),
        itemDiscounts,
      }
    : null;
}

function getEqualSplitTotals(total: number, parts: number) {
  if (!Number.isInteger(parts) || parts < 2) {
    return [];
  }

  const totalCents = toCents(total);
  const baseCents = Math.floor(totalCents / parts);
  const remainder = totalCents % parts;

  return Array.from({ length: parts }, (_, index) =>
    fromCents(baseCents + (index < remainder ? 1 : 0)),
  );
}

export function PosWorkspace({
  initialCompanyId,
  initialAuthorizedUserId,
  initialProducts,
  initialPromotions,
  initialCatalogError,
}: {
  initialCompanyId: string;
  initialAuthorizedUserId: string;
  initialProducts: Product[];
  initialPromotions: ActivePromotion[];
  initialCatalogError: string;
}) {
  // La empresa y la persona que autoriza salen de la sesión, no se capturan.
  const companyId = initialCompanyId;
  const authorizedUserId = initialAuthorizedUserId;
  const [products, setProducts] = useState<Product[]>(
    initialProducts.filter((product) => product.status === 'active'),
  );
  const [activePromotions, setActivePromotions] =
    useState<ActivePromotion[]>(initialPromotions);
  const [appliedPromotionId, setAppliedPromotionId] = useState('');
  const [promotionNotice, setPromotionNotice] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [catalogError, setCatalogError] = useState(initialCatalogError);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [catalogId, setCatalogId] = useState('all');
  const [commerceCatalogs, setCommerceCatalogs] = useState<Array<{ id: string; name: string }>>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<CartDiscount>();
  const [discountEditor, setDiscountEditor] = useState<DiscountEditor>();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [benefitPhone, setBenefitPhone] = useState('');
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>();
  const [checkoutError, setCheckoutError] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<Receipt>();
  const [receiptQr, setReceiptQr] = useState({
    orderId: '',
    dataUrl: '',
  });
  const [customerReceipts, setCustomerReceipts] = useState<Receipt[]>([]);
  const [showCancelSale, setShowCancelSale] = useState(false);
  const [showConfirmCheckout, setShowConfirmCheckout] = useState(false);
  const [cancellingSale, setCancellingSale] = useState(false);
  const [cancelSaleError, setCancelSaleError] = useState('');
  const [showVoidPaidSale, setShowVoidPaidSale] = useState(false);
  const [voidingPaidSale, setVoidingPaidSale] = useState(false);
  const [voidPaidSaleError, setVoidPaidSaleError] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [voidMerchandiseConfirmed, setVoidMerchandiseConfirmed] =
    useState(false);
  const voidOperationIds = useRef<{
    orderId: string;
    returnId: string;
    refundId: string;
  } | undefined>(undefined);
  const [searchError, setSearchError] = useState('');
  const [splitEditor, setSplitEditor] = useState<SplitEditor>();
  const [splitCheckout, setSplitCheckout] = useState<SplitCheckout>();
  const [splitPaymentMethod, setSplitPaymentMethod] = useState('cash');
  const [splitReceivedAmount, setSplitReceivedAmount] = useState('');
  const [splitPaymentReference, setSplitPaymentReference] = useState('');
  const [splitPaymentError, setSplitPaymentError] = useState('');
  const [processingSplit, setProcessingSplit] = useState(false);
  const [quickProductEditor, setQuickProductEditor] =
    useState<QuickProductEditor>();
  const [savingQuickProduct, setSavingQuickProduct] = useState(false);
  const [showRewardRedeem, setShowRewardRedeem] =
    useState(false);
  const [rewardCode, setRewardCode] = useState('');
  const [redeemingReward, setRedeemingReward] =
    useState(false);
  const [rewardRedeemError, setRewardRedeemError] =
    useState('');
  const [rewardRedeemMessage, setRewardRedeemMessage] =
    useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!companyId) {
      return;
    }

    let active = true;

    void apiRequest<ActivePromotion[]>(
      `promotion/public/company/${companyId}`,
    )
      .then((promotions) => {
        if (active) {
          setActivePromotions(promotions);
        }
      })
      .catch(() => {
        if (active) {
          setActivePromotions([]);
        }
      });

    void apiRequest<{ expired: number }>(
      `order/company/${companyId}/expire-abandoned`,
      { method: 'POST' },
    )
      .then(async (result) => {
        if (!active || result.expired === 0) {
          return;
        }

        const catalog = await apiRequest<Product[]>(
          `catalog/product/company/${companyId}`,
        );

        if (active) {
          setProducts(
            catalog.filter(
              (product) => product.status === 'active',
            ),
          );
        }
      })
      .catch(() => {
        // La caja sigue disponible aunque la limpieza automática falle.
      });

    return () => {
      active = false;
    };
  }, [companyId]);

  useEffect(() => {
    const claim = receipt?.payment.benefitClaim;

    if (!claim) {
      return;
    }

    const ticketUrl = `${window.location.origin}/r/${claim.siteSlug}?ticket=${encodeURIComponent(
      claim.orderId,
    )}&token=${encodeURIComponent(claim.token)}`;
    let cancelled = false;

    void QRCode.toDataURL(ticketUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
    }).then((dataUrl) => {
      if (!cancelled) {
        setReceiptQr({
          orderId: claim.orderId,
          dataUrl,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [receipt?.payment.benefitClaim]);

  useEffect(() => {
    if (cart.length === 0) {
      setAppliedPromotionId('');
      setPromotionNotice('');
    }
  }, [cart.length]);

  async function loadProducts(targetCompanyId = companyId) {
    if (!targetCompanyId) {
      setProducts([]);
      return [];
    }

    setLoadingProducts(true);
    setCatalogError('');

    try {
      const catalog = await apiRequest<Product[]>(
        `catalog/product/company/${targetCompanyId}`,
      );
      const activeProducts = catalog.filter(
        (product) => product.status === 'active',
      );
      setProducts(activeProducts);
      void loadPromotions(targetCompanyId);
      return activeProducts;
    } catch (error) {
      setProducts([]);
      setCatalogError(
        error instanceof Error ? error.message : 'No se pudo cargar el catálogo',
      );
      return [];
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadPromotions(targetCompanyId = companyId) {
    if (!targetCompanyId) {
      setActivePromotions([]);
      return [];
    }

    try {
      const promotions = await apiRequest<ActivePromotion[]>(
        `promotion/public/company/${targetCompanyId}`,
      );
      setActivePromotions(promotions);
      return promotions;
    } catch {
      setActivePromotions([]);
      return [];
    }
  }

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    void apiRequest<Array<{ id: string; name: string }>>(`catalog/commerce/company/${companyId}`)
      .then((result) => { if (active) setCommerceCatalogs(result); })
      .catch(() => { if (active) setCommerceCatalogs([]); });
    return () => { active = false; };
  }, [companyId]);

  const saleOptions = useMemo(
    () => getSaleOptions(products).filter((option) => catalogId === 'all' || option.catalogId === catalogId),
    [products, catalogId],
  );
  const categories = useMemo(() => {
    const values = new Map<string, string>();

    for (const option of saleOptions) {
      if (option.categoryId) {
        values.set(option.categoryId, option.categoryName);
      }
    }

    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name, 'es'),
    );
  }, [saleOptions]);
  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es-MX');

    return saleOptions.filter((option) => {
      const matchesCategory =
        categoryId === 'all' || option.categoryId === categoryId;
      const searchable = [
        option.productName,
        option.variantName,
        option.sku,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-MX');

      return matchesCategory && searchable.includes(normalizedSearch);
    });
  }, [categoryId, saleOptions, search]);
  const totals = useMemo(
    () => getCartTotals(cart, orderDiscount),
    [cart, orderDiscount],
  );
  const bestPromotionPlan = useMemo(() => {
    const plans = activePromotions
      .map((promotion) => buildPromotionPlan(promotion, cart))
      .filter((plan): plan is PromotionPlan => Boolean(plan))
      .sort(
        (left, right) =>
          right.savings - left.savings ||
          Number(right.promotion.featured) -
            Number(left.promotion.featured),
      );

    return plans[0] ?? null;
  }, [activePromotions, cart]);
  const promotionOpportunity = useMemo(() => {
    if (cart.length === 0) {
      return null;
    }

    const subtotal = getCartTotals(cart).subtotal;
    const nearestMinimum = activePromotions
      .filter(
        (promotion) =>
          Boolean(promotion.minimumPurchase) &&
          (promotion.minimumPurchase ?? 0) > subtotal &&
          (promotion.scope !== 'selected_products' ||
            promotion.products.some((promotionProduct) =>
              cart.some(
                (cartItem) =>
                  cartItem.productId === promotionProduct.productId,
              ),
            )),
      )
      .map((promotion) => ({
        promotion,
        missing: (promotion.minimumPurchase ?? 0) - subtotal,
      }))
      .sort((left, right) => left.missing - right.missing)[0];

    if (nearestMinimum) {
      return {
        title: nearestMinimum.promotion.title,
        message: `Faltan ${money.format(nearestMinimum.missing)} para activar esta oferta.`,
      };
    }

    for (const promotion of activePromotions) {
      if (
        promotion.type !== 'buy_x_get_y' ||
        !promotion.buyQuantity ||
        !promotion.getQuantity
      ) {
        continue;
      }

      const productIds = new Set(
        promotion.products.map((item) => item.productId),
      );
      const item = cart.find((cartItem) =>
        productIds.has(cartItem.productId),
      );

      if (!item) {
        continue;
      }

      const groupSize =
        promotion.buyQuantity + promotion.getQuantity;
      const remainder = item.quantity % groupSize;

      if (remainder > 0) {
        const missing = groupSize - remainder;

        return {
          title: promotion.title,
          message: `Agrega ${missing} ${missing === 1 ? 'unidad' : 'unidades'} de ${item.productName} para activar la oferta.`,
        };
      }
    }

    return null;
  }, [activePromotions, cart]);
  const cartLocked = Boolean(checkoutSession || splitCheckout);
  const activeSplit = splitCheckout?.splits.find(
    (split) => split.status !== 'paid',
  );
  const paidSplitCount =
    splitCheckout?.splits.filter((split) => split.status === 'paid').length ?? 0;
  const receiptQrDataUrl =
    receipt?.payment.benefitClaim?.orderId ===
    receiptQr.orderId
      ? receiptQr.dataUrl
      : '';

  function removeAppliedPromotion() {
    setCart((current) =>
      current.map((item) =>
        item.discount?.source === 'promotion'
          ? { ...item, discount: undefined }
          : item,
      ),
    );
    setOrderDiscount((current) =>
      current?.source === 'promotion' ? undefined : current,
    );
    setAppliedPromotionId('');
    setPromotionNotice('');
  }

  function applyPromotion(plan: PromotionPlan) {
    if (cartLocked) {
      return;
    }

    const hasDiscount =
      Boolean(orderDiscount) ||
      cart.some((item) => Boolean(item.discount));

    if (
      hasDiscount &&
      !window.confirm(
        'Esta oferta reemplazará el descuento actual. ¿Quieres continuar?',
      )
    ) {
      return;
    }

    setCart((current) =>
      current.map((item) => ({
        ...item,
        discount: plan.itemDiscounts[item.key],
      })),
    );
    setOrderDiscount(plan.orderDiscount);
    setAppliedPromotionId(plan.promotion.id);
    setPromotionNotice(
      `Aplicaste ${plan.promotion.title}. El cliente ahorra ${money.format(
        plan.savings,
      )}.`,
    );
    setCheckoutError('');
  }

  function addOption(option: SaleOption, units = 1) {
    if (cartLocked || (option.trackInventory && option.stock <= 0)) {
      return;
    }

    removeAppliedPromotion();

    setCart((current) => {
      const safeUnits = Number.isInteger(units) && units > 0 ? units : 1;
      const existing = current.find((item) => item.key === option.key);

      if (existing) {
        const nextQuantity = existing.quantity + safeUnits;

        if (option.trackInventory && nextQuantity > option.stock) {
          return current;
        }

        return current.map((item) =>
          item.key === option.key
            ? { ...item, quantity: nextQuantity }
            : item,
        );
      }

      if (option.trackInventory && safeUnits > option.stock) return current;
      return [...current, { ...option, quantity: safeUnits }];
    });
    setSearch('');
    setSearchError('');
    searchRef.current?.focus();
  }

  function changeQuantity(key: string, delta: number) {
    if (cartLocked) {
      return;
    }

    removeAppliedPromotion();

    setCart((current) =>
      current.flatMap((item) => {
        if (item.key !== key) {
          return [item];
        }

        const quantity = item.quantity + delta;

        if (quantity <= 0) {
          return [];
        }
        if (item.trackInventory && quantity > item.stock) {
          return [item];
        }

        return [{ ...item, quantity }];
      }),
    );
  }

  async function resolveBarcode(code: string) {
    const normalized = code.trim();
    if (!companyId || !normalized) return;
    setSearchError('');
    try {
      const resolved = await apiRequest<BarcodeResolution>(
        `catalog/barcode/company/${encodeURIComponent(companyId)}/${encodeURIComponent(normalized)}`,
      );
      const option = saleOptions.find((candidate) =>
        resolved.variant
          ? candidate.productId === resolved.product.id && candidate.variantId === resolved.variant.id
          : candidate.productId === resolved.product.id && !candidate.variantId,
      );
      if (!option) {
        setSearch(normalized);
        setSearchError('El código existe, pero el producto no está disponible para venta en esta caja.');
        return;
      }
      addOption(option, resolved.unitsPerScan ?? 1);
    } catch (error) {
      setSearch(normalized);
      setSearchError(error instanceof Error ? error.message : 'Código no registrado');
    }
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = search.trim().toLocaleLowerCase('es-MX');
    const exactSku = saleOptions.find(
      (option) => option.sku?.toLocaleLowerCase('es-MX') === normalized,
    );

    if (exactSku) {
      addOption(exactSku);
      return;
    }

    if (filteredOptions.length === 1) {
      addOption(filteredOptions[0]);
      return;
    }

    if (normalized && filteredOptions.length === 0) {
      void resolveBarcode(search);
      return;
    }

    setSearchError(
      !normalized
        ? 'Escribe un producto o escanea un código registrado.'
        : filteredOptions.length > 1
          ? 'Encontramos varios productos. Selecciona el correcto de la lista.'
          : 'Producto no registrado. Verifica el código o solicita su alta a un usuario autorizado.',
    );
  }

  function openQuickProductEditor() {
    setQuickProductEditor({
      name: '',
      sku: search.trim(),
      type: 'product',
      price: '',
      trackInventory: true,
      stock: '1',
      categoryId: categoryId === 'all' ? '' : categoryId,
      error: '',
    });
  }

  async function saveQuickProduct(event: FormEvent) {
    event.preventDefault();

    if (!quickProductEditor || savingQuickProduct) {
      return;
    }

    const name = quickProductEditor.name.trim();
    const sku = quickProductEditor.sku.trim();
    const price = Number(quickProductEditor.price);
    const stock = Number(quickProductEditor.stock);

    if (!companyId) {
      setQuickProductEditor({
        ...quickProductEditor,
        error: 'Conecta esta caja con una empresa antes de registrar productos.',
      });
      return;
    }

    if (!name) {
      setQuickProductEditor({
        ...quickProductEditor,
        error: 'Escribe el nombre del producto.',
      });
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setQuickProductEditor({
        ...quickProductEditor,
        error: 'Escribe un precio válido.',
      });
      return;
    }

    if (
      quickProductEditor.trackInventory &&
      (!Number.isInteger(stock) || stock < 1)
    ) {
      setQuickProductEditor({
        ...quickProductEditor,
        error:
          'Para agregarlo a la venta, el stock debe ser un número entero igual o mayor que uno.',
      });
      return;
    }

    setSavingQuickProduct(true);
    setQuickProductEditor({ ...quickProductEditor, error: '' });

    try {
      const created = await apiRequest<{ id: string }>('catalog/product', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type: quickProductEditor.type,
          sku: sku || undefined,
          price,
          trackInventory: quickProductEditor.trackInventory,
          stock: quickProductEditor.trackInventory ? stock : 0,
          companyId,
          catalogId: catalogId === 'all' ? undefined : catalogId,
          categoryId: quickProductEditor.categoryId || undefined,
        }),
      });
      const refreshedProducts = await loadProducts(companyId);
      const createdProduct = refreshedProducts.find(
        (product) => product.id === created.id,
      );
      const createdOptions = createdProduct
        ? getSaleOptions([createdProduct])
        : [];
      const normalizedSku = sku.toLocaleLowerCase('es-MX');
      const option =
        createdOptions.find(
          (candidate) =>
            normalizedSku &&
            candidate.sku?.toLocaleLowerCase('es-MX') === normalizedSku,
        ) ?? createdOptions[0];

      setQuickProductEditor(undefined);

      if (option) {
        addOption(option);
      } else {
        setSearch('');
        setSearchError(
          'Producto registrado. Actualiza el catálogo para agregarlo a la venta.',
        );
      }
    } catch (error) {
      setQuickProductEditor((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof Error
                  ? error.message
                  : 'No fue posible registrar el producto',
            }
          : current,
      );
    } finally {
      setSavingQuickProduct(false);
    }
  }

  async function voidPaidSale() {
    if (!receipt || !companyId || !authorizedUserId) {
      return;
    }

    if (!voidReason) {
      setVoidPaidSaleError('Selecciona el motivo de la anulación');
      return;
    }

    if (!voidMerchandiseConfirmed) {
      setVoidPaidSaleError(
        'Confirma que la mercancía continúa físicamente en caja',
      );
      return;
    }

    if (!voidOperationIds.current || voidOperationIds.current.orderId !== receipt.order.id) {
      voidOperationIds.current = {
        orderId: receipt.order.id,
        returnId: crypto.randomUUID(),
        refundId: crypto.randomUUID(),
      };
    }

    const operationIds = voidOperationIds.current;
    setVoidingPaidSale(true);
    setVoidPaidSaleError('');

    try {
      const items = receipt.order.items.map((orderItem) => {
        const cartItem = receipt.items.find(
          (item) =>
            item.productId === orderItem.productId &&
            (item.variantId ?? null) === orderItem.variantId,
        );

        if (!cartItem) {
          throw new Error('No fue posible relacionar un producto de la venta');
        }

        return {
          orderItemId: orderItem.id,
          quantity: cartItem.quantity,
          condition: 'sellable',
          disposition: cartItem.trackInventory ? 'restock' : 'no_restock',
        };
      });

      const created = await apiRequest<ReturnRecord>('return', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          orderId: receipt.order.id,
          authorizedById: authorizedUserId,
          type: 'return',
          reason: voidReason,
          notes:
            'Anulación inmediata antes de entregar mercancía. El responsable confirmó que los productos permanecían físicamente en caja.',
          operationId: operationIds.returnId,
          items,
        }),
      });

      const completedReturn =
        created.status === 'completed'
          ? created
          : (
              await apiRequest<ConfirmReturnResult>(
                `return/${created.id}/confirm`,
                { method: 'POST' },
              )
            ).return;

      await apiRequest(`return/${completedReturn.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          processedById: authorizedUserId,
          method: receipt.payment.payment.method,
          paymentId: receipt.payment.payment.id,
          notes: 'Reembolso por anulación inmediata en caja',
          operationId: operationIds.refundId,
        }),
      });

      const orderNumber = receipt.order.orderNumber;
      setShowVoidPaidSale(false);
      setVoidReason('');
      setVoidMerchandiseConfirmed(false);
      setReceipt(undefined);
      setCheckoutError(
        `Venta ${orderNumber} anulada. El pago quedó registrado como reembolsado y el inventario vendible fue repuesto.`,
      );
      voidOperationIds.current = undefined;
      await loadProducts();
    } catch (error) {
      setVoidPaidSaleError(
        error instanceof Error
          ? error.message
          : 'No fue posible anular la venta pagada',
      );
    } finally {
      setVoidingPaidSale(false);
    }
  }

  function openDiscountEditor(target: 'order' | CartItem) {
    const current = target === 'order' ? orderDiscount : target.discount;

    setDiscountEditor({
      targetKey: target === 'order' ? 'order' : target.key,
      label:
        target === 'order'
          ? 'Descuento de la venta'
          : `${target.productName}${
              target.variantName ? ` · ${target.variantName}` : ''
            }`,
      type: current?.type ?? 'percentage',
      value: current ? String(current.value) : '',
      reason: current?.reason ?? '',
      error: '',
    });
  }

  function saveDiscount(event: FormEvent) {
    event.preventDefault();

    if (!discountEditor) {
      return;
    }

    const value = Number(discountEditor.value);
    const reason = discountEditor.reason.trim();

    if (!Number.isFinite(value) || value <= 0) {
      setDiscountEditor({
        ...discountEditor,
        error: 'Escribe un valor mayor a cero',
      });
      return;
    }
    if (discountEditor.type === 'percentage' && value > 100) {
      setDiscountEditor({
        ...discountEditor,
        error: 'El porcentaje máximo es 100',
      });
      return;
    }
    if (!reason) {
      setDiscountEditor({
        ...discountEditor,
        error: 'El motivo es obligatorio para conservar la auditoría',
      });
      return;
    }

    const targetItem = cart.find(
      (item) => item.key === discountEditor.targetKey,
    );
    const available =
      discountEditor.targetKey === 'order'
        ? getCartTotals(cart).total
        : targetItem
          ? targetItem.price * targetItem.quantity
          : 0;

    if (discountEditor.type === 'fixed' && value > available) {
      setDiscountEditor({
        ...discountEditor,
        error: `El descuento no puede superar ${money.format(available)}`,
      });
      return;
    }
    if (
      discountEditor.type === 'special_price' &&
      (!targetItem || value > targetItem.price)
    ) {
      setDiscountEditor({
        ...discountEditor,
        error: `El precio especial no puede superar ${money.format(
          targetItem?.price ?? 0,
        )}`,
      });
      return;
    }

    const discount: CartDiscount = {
      type: discountEditor.type,
      value,
      reason,
      source: 'manual',
    };

    removeAppliedPromotion();

    if (discountEditor.targetKey === 'order') {
      setOrderDiscount(discount);
    } else {
      setCart((current) =>
        current.map((item) =>
          item.key === discountEditor.targetKey
            ? { ...item, discount }
            : item,
        ),
      );
    }

    setDiscountEditor(undefined);
  }

  function removeDiscount(targetKey: 'order' | string) {
    const selectedDiscount =
      targetKey === 'order'
        ? orderDiscount
        : cart.find((item) => item.key === targetKey)?.discount;

    if (selectedDiscount?.source === 'promotion') {
      removeAppliedPromotion();
      return;
    }

    if (targetKey === 'order') {
      setOrderDiscount(undefined);
      return;
    }

    setCart((current) =>
      current.map((item) =>
        item.key === targetKey ? { ...item, discount: undefined } : item,
      ),
    );
  }

  async function identifyBenefitCustomer() {
    const phone = benefitPhone.trim();

    if (!phone) {
      return null;
    }

    return apiRequest<CustomerIdentityResult>(
      `engagement/company/${companyId}/identify`,
      {
        method: 'POST',
        body: JSON.stringify({ phone }),
      },
    );
  }

  async function checkout() {
    if (!companyId || !authorizedUserId) {
      setCheckoutError('Tu sesión no tiene empresa activa. Vuelve a iniciar sesión.');
      return;
    }
    if (cart.length === 0) {
      setCheckoutError('Agrega al menos un producto');
      return;
    }

    const received = receivedAmount ? Number(receivedAmount) : undefined;

    if (paymentMethod === 'cash' && received === undefined) {
      setCheckoutError(
        'Escribe cuánto efectivo entregó el cliente o selecciona Pago exacto',
      );
      return;
    }

    if (
      paymentMethod === 'cash' &&
      received !== undefined &&
      (!Number.isFinite(received) || received < totals.total)
    ) {
      setCheckoutError('El efectivo recibido no cubre el total de la venta');
      return;
    }

    setCheckingOut(true);
    setCheckoutError('');
    let session = checkoutSession;

    try {
      if (!session) {
        const identity =
          await identifyBenefitCustomer();
        const order = await apiRequest<Order>('order', {
          method: 'POST',
          body: JSON.stringify({
            companyId,
            catalogId: catalogId === 'all' ? undefined : catalogId,
            customerId: identity?.customer.id,
            loyaltyProgramId:
              identity?.program?.id,
            source: 'counter',
            orderType: 'counter',
            notes: 'Venta creada desde Yalika Punto de Venta',
            items: cart.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          }),
        });

        session = {
          order,
          appliedDiscountKeys: [],
          discountOperationIds: {},
          confirmed: false,
        };
        setCheckoutSession(session);
      }

      for (const cartItem of cart) {
        if (
          !cartItem.discount ||
          session.appliedDiscountKeys.includes(cartItem.key)
        ) {
          continue;
        }

        const orderItem = session.order.items.find(
          (item) =>
            item.productId === cartItem.productId &&
            (item.variantId ?? undefined) === cartItem.variantId,
        );

        if (!orderItem) {
          throw new Error('No fue posible relacionar un producto del pedido');
        }

        let operationId: string | undefined =
          session.discountOperationIds[cartItem.key];

        if (!operationId) {
          operationId = crypto.randomUUID();
          session = {
            ...session,
            discountOperationIds: {
              ...session.discountOperationIds,
              [cartItem.key]: operationId,
            },
          };
          setCheckoutSession(session);
        }

        const discountResult: DiscountResult = await apiRequest<DiscountResult>(
          `discount/order/${session.order.id}`,
          {
            method: 'POST',
            body: JSON.stringify({
              companyId,
              authorizedById: authorizedUserId,
              scope: 'item',
              orderItemId: orderItem.id,
              source: cartItem.discount.source ?? 'manual',
              promotionId: cartItem.discount.promotionId,
              type:
                cartItem.discount.source === 'promotion'
                  ? undefined
                  : cartItem.discount.type,
              value:
                cartItem.discount.source === 'promotion'
                  ? undefined
                  : cartItem.discount.value,
              reason: cartItem.discount.reason,
              operationId,
            }),
          },
        );

        session = {
          ...session,
          order: discountResult.order,
          appliedDiscountKeys: [
            ...session.appliedDiscountKeys,
            cartItem.key,
          ],
        };
        setCheckoutSession(session);
      }

      if (orderDiscount && !session.appliedDiscountKeys.includes('order')) {
        let operationId: string | undefined =
          session.discountOperationIds.order;

        if (!operationId) {
          operationId = crypto.randomUUID();
          session = {
            ...session,
            discountOperationIds: {
              ...session.discountOperationIds,
              order: operationId,
            },
          };
          setCheckoutSession(session);
        }

        const discountResult: DiscountResult = await apiRequest<DiscountResult>(
          `discount/order/${session.order.id}`,
          {
            method: 'POST',
            body: JSON.stringify({
              companyId,
              authorizedById: authorizedUserId,
              scope: 'order',
              source: orderDiscount.source ?? 'manual',
              promotionId: orderDiscount.promotionId,
              type:
                orderDiscount.source === 'promotion'
                  ? undefined
                  : orderDiscount.type,
              value:
                orderDiscount.source === 'promotion'
                  ? undefined
                  : orderDiscount.value,
              reason: orderDiscount.reason,
              operationId,
            }),
          },
        );

        session = {
          ...session,
          order: discountResult.order,
          appliedDiscountKeys: [...session.appliedDiscountKeys, 'order'],
        };
        setCheckoutSession(session);
      }

      if (!session.confirmed) {
        const confirmation: ConfirmationResult =
          await apiRequest<ConfirmationResult>(
          `order/${session.order.id}/confirm`,
          { method: 'POST' },
        );

        session = {
          ...session,
          order: confirmation.order,
          confirmed: true,
        };
        setCheckoutSession(session);
      }

      const payment = await apiRequest<PaymentResult>(
        `payment/order/${session.order.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            method: paymentMethod,
            receivedAmount:
              paymentMethod === 'cash' && received !== undefined
                ? received
                : undefined,
            reference:
              paymentMethod !== 'cash' && paymentReference.trim()
                ? paymentReference.trim()
                : undefined,
          }),
        },
      );

      setReceipt({ order: session.order, payment, items: [...cart] });
      setCheckoutSession(undefined);
      setCart([]);
      setOrderDiscount(undefined);
      setReceivedAmount('');
      setPaymentReference('');
      setBenefitPhone('');
      await loadProducts();
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : 'No se pudo completar la venta',
      );
    } finally {
      setCheckingOut(false);
    }
  }

  async function startSplitCheckout(event: FormEvent) {
    event.preventDefault();

    if (!splitEditor) {
      return;
    }

    if (!companyId || !authorizedUserId) {
      setSplitEditor({
        ...splitEditor,
        error: 'Tu sesión no tiene empresa activa. Vuelve a iniciar sesión.',
      });
      return;
    }

    if (cart.length === 0) {
      setSplitEditor({
        ...splitEditor,
        error: 'Agrega al menos un producto',
      });
      return;
    }

    const parts = Number(splitEditor.parts);

    if (!Number.isInteger(parts) || parts < 2 || parts > 10) {
      setSplitEditor({
        ...splitEditor,
        error: 'Selecciona entre 2 y 10 cuentas',
      });
      return;
    }

    setCheckingOut(true);
    setCheckoutError('');
    setSplitEditor({
      ...splitEditor,
      error: '',
    });

    let session = checkoutSession;

    try {
      if (!session) {
        const identity =
          await identifyBenefitCustomer();
        const order = await apiRequest<Order>('order', {
          method: 'POST',
          body: JSON.stringify({
            companyId,
            catalogId: catalogId === 'all' ? undefined : catalogId,
            customerId: identity?.customer.id,
            loyaltyProgramId:
              identity?.program?.id,
            source: 'counter',
            orderType: 'counter',
            notes: 'Venta dividida desde Yalika Punto de Venta',
            items: cart.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          }),
        });

        session = {
          order,
          appliedDiscountKeys: [],
          discountOperationIds: {},
          confirmed: false,
        };
        setCheckoutSession(session);
      }

      for (const cartItem of cart) {
        if (
          !cartItem.discount ||
          session.appliedDiscountKeys.includes(cartItem.key)
        ) {
          continue;
        }

        const orderItem = session.order.items.find(
          (item) =>
            item.productId === cartItem.productId &&
            (item.variantId ?? undefined) === cartItem.variantId,
        );

        if (!orderItem) {
          throw new Error('No fue posible relacionar un producto del pedido');
        }

        let operationId: string | undefined =
          session.discountOperationIds[cartItem.key];

        if (!operationId) {
          operationId = crypto.randomUUID();
          session = {
            ...session,
            discountOperationIds: {
              ...session.discountOperationIds,
              [cartItem.key]: operationId,
            },
          };
          setCheckoutSession(session);
        }

        const discountResult: DiscountResult = await apiRequest<DiscountResult>(
          `discount/order/${session.order.id}`,
          {
            method: 'POST',
            body: JSON.stringify({
              companyId,
              authorizedById: authorizedUserId,
              scope: 'item',
              orderItemId: orderItem.id,
              source: cartItem.discount.source ?? 'manual',
              promotionId: cartItem.discount.promotionId,
              type:
                cartItem.discount.source === 'promotion'
                  ? undefined
                  : cartItem.discount.type,
              value:
                cartItem.discount.source === 'promotion'
                  ? undefined
                  : cartItem.discount.value,
              reason: cartItem.discount.reason,
              operationId,
            }),
          },
        );

        session = {
          ...session,
          order: discountResult.order,
          appliedDiscountKeys: [
            ...session.appliedDiscountKeys,
            cartItem.key,
          ],
        };
        setCheckoutSession(session);
      }

      if (orderDiscount && !session.appliedDiscountKeys.includes('order')) {
        let operationId: string | undefined =
          session.discountOperationIds.order;

        if (!operationId) {
          operationId = crypto.randomUUID();
          session = {
            ...session,
            discountOperationIds: {
              ...session.discountOperationIds,
              order: operationId,
            },
          };
          setCheckoutSession(session);
        }

        const discountResult: DiscountResult = await apiRequest<DiscountResult>(
          `discount/order/${session.order.id}`,
          {
            method: 'POST',
            body: JSON.stringify({
              companyId,
              authorizedById: authorizedUserId,
              scope: 'order',
              source: orderDiscount.source ?? 'manual',
              promotionId: orderDiscount.promotionId,
              type:
                orderDiscount.source === 'promotion'
                  ? undefined
                  : orderDiscount.type,
              value:
                orderDiscount.source === 'promotion'
                  ? undefined
                  : orderDiscount.value,
              reason: orderDiscount.reason,
              operationId,
            }),
          },
        );

        session = {
          ...session,
          order: discountResult.order,
          appliedDiscountKeys: [...session.appliedDiscountKeys, 'order'],
        };
        setCheckoutSession(session);
      }

      if (!session.confirmed) {
        const confirmation = await apiRequest<ConfirmationResult>(
          `order/${session.order.id}/confirm`,
          { method: 'POST' },
        );

        session = {
          ...session,
          order: confirmation.order,
          confirmed: true,
        };
        setCheckoutSession(session);
      }

      const splitResult = await apiRequest<EqualSplitResult>(
        `order-split/order/${session.order.id}/equal`,
        {
          method: 'POST',
          body: JSON.stringify({ parts }),
        },
      );

      setSplitCheckout({
        order: session.order,
        items: [...cart],
        splits: splitResult.splits,
        payments: [],
      });
      setSplitEditor(undefined);
      setSplitReceivedAmount('');
      setSplitPaymentReference('');
      setSplitPaymentError('');
    } catch (error) {
      setSplitEditor((current) =>
        current
          ? {
              ...current,
              error:
                error instanceof Error
                  ? error.message
                  : 'No fue posible dividir la cuenta',
            }
          : current,
      );
    } finally {
      setCheckingOut(false);
    }
  }

  async function payCurrentSplit() {
    if (!splitCheckout) {
      return;
    }

    const currentSplit = splitCheckout.splits.find(
      (split) => split.status !== 'paid',
    );

    if (!currentSplit) {
      return;
    }

    const received = splitReceivedAmount
      ? Number(splitReceivedAmount)
      : undefined;

    if (
      splitPaymentMethod === 'cash' &&
      received !== undefined &&
      (!Number.isFinite(received) || received < currentSplit.total)
    ) {
      setSplitPaymentError('El efectivo recibido no cubre esta cuenta');
      return;
    }

    setProcessingSplit(true);
    setSplitPaymentError('');

    try {
      const payment = await apiRequest<PaymentResult>(
        `payment/order/${splitCheckout.order.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            method: splitPaymentMethod,
            amount: currentSplit.total,
            orderSplitId: currentSplit.id,
            receivedAmount:
              splitPaymentMethod === 'cash' && received !== undefined
                ? received
                : undefined,
            reference:
              splitPaymentMethod !== 'cash' &&
              splitPaymentReference.trim()
                ? splitPaymentReference.trim()
                : undefined,
          }),
        },
      );

      const payments = [...splitCheckout.payments, payment];
      const splits = splitCheckout.splits.map((split) =>
        split.id === currentSplit.id
          ? {
              ...split,
              status: payment.split?.status ?? 'paid',
            }
          : split,
      );

      if (payment.order.paymentStatus === 'paid') {
        const totalChange = payments.reduce(
          (total, result) => total + result.summary.changeAmount,
          0,
        );

        setReceipt({
          order: {
            ...splitCheckout.order,
            paymentStatus: 'paid',
          },
          payment: {
            ...payment,
            summary: {
              ...payment.summary,
              changeAmount: totalChange,
            },
          },
          items: splitCheckout.items,
        });
        setSplitCheckout(undefined);
        setCheckoutSession(undefined);
        setCart([]);
        setOrderDiscount(undefined);
        setSplitReceivedAmount('');
        setSplitPaymentReference('');
        setBenefitPhone('');
        await loadProducts();
        return;
      }

      setSplitCheckout({
        ...splitCheckout,
        splits,
        payments,
      });
      setSplitReceivedAmount('');
      setSplitPaymentReference('');
    } catch (error) {
      setSplitPaymentError(
        error instanceof Error
          ? error.message
          : 'No fue posible cobrar esta cuenta',
      );
    } finally {
      setProcessingSplit(false);
    }
  }

  async function redeemReward(event: FormEvent) {
    event.preventDefault();

    if (!companyId || !authorizedUserId) {
      setRewardRedeemError(
        'Tu sesión no tiene empresa activa. Vuelve a iniciar sesión.',
      );
      return;
    }

    if (!rewardCode.trim()) {
      setRewardRedeemError('Escribe el código del premio.');
      return;
    }

    setRedeemingReward(true);
    setRewardRedeemError('');
    setRewardRedeemMessage('');

    try {
      const redeemed = await apiRequest<{
        customer: { name: string };
        prize: { name: string };
      }>(`scratch/company/${companyId}/redeem`, {
        method: 'POST',
        body: JSON.stringify({
          claimCode: rewardCode.trim(),
          authorizedById: authorizedUserId,
        }),
      });

      setRewardCode('');
      setRewardRedeemMessage(
        `Entregado: ${redeemed.prize.name} a ${redeemed.customer.name}.`,
      );
    } catch (error) {
      setRewardRedeemError(
        error instanceof Error
          ? error.message
          : 'No fue posible canjear el premio',
      );
    } finally {
      setRedeemingReward(false);
    }
  }

  function newSale() {
    if (receipt) {
      setCustomerReceipts((current) => [...current, receipt]);
    }
    setReceipt(undefined);
    setCheckoutError('');
    setSplitEditor(undefined);
    setSplitCheckout(undefined);
    setSplitPaymentError('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function finishCustomer() {
    setReceipt(undefined);
    setCustomerReceipts([]);
    setCheckoutError('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function printAndFinishCustomer() {
    window.print();
    finishCustomer();
  }

  function saveSplitForLater() {
    setSplitCheckout(undefined);
    setCheckoutSession(undefined);
    setCart([]);
    setOrderDiscount(undefined);
    setSplitReceivedAmount('');
    setSplitPaymentReference('');
    setBenefitPhone('');
    setSplitPaymentError('');
    setCheckoutError('');
    void loadProducts();
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  async function cancelCurrentSale() {
    if (cancellingSale) {
      return;
    }

    setCancellingSale(true);
    setCancelSaleError('');

    try {
      const orderId =
        splitCheckout?.order.id ??
        checkoutSession?.order.id;

      if (orderId) {
        await apiRequest(`order/${orderId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            reason:
              'El cliente no completó el pago en Punto de venta',
          }),
        });
      }

      setCart([]);
      setOrderDiscount(undefined);
      setReceivedAmount('');
      setPaymentReference('');
      setBenefitPhone('');
      setCheckoutSession(undefined);
      setSplitCheckout(undefined);
      setSplitEditor(undefined);
      setSplitPaymentError('');
      setCheckoutError('');
      setShowCancelSale(false);
      await loadProducts();
      setTimeout(() => searchRef.current?.focus(), 0);
    } catch (error) {
      setCancelSaleError(
        error instanceof Error
          ? error.message
          : 'No fue posible cancelar la venta',
      );
    } finally {
      setCancellingSale(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <div className="border-b border-slate-800/80 bg-slate-950/70 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              YALIKA / Ventas
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Punto de venta
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Caja lista
            </div>
            <Link
              href="/asistente"
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
            >
              ✦ Asistente
            </Link>
            <button
              type="button"
              onClick={() => {
                setRewardRedeemError('');
                setRewardRedeemMessage('');
                setShowRewardRedeem(true);
              }}
              className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-amber-300/20"
            >
              Premios
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1600px] gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="min-w-0">
          <form onSubmit={handleSearchSubmit} className="relative">
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-xl text-slate-500">
              ⌕
            </span>
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchError('');
              }}
              autoFocus
              placeholder="Buscar producto o escanear código…"
              className="h-16 w-full rounded-2xl border border-slate-700 bg-slate-900 pl-14 pr-28 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10"
            />
            <button
              type="submit"
              className="absolute right-2 top-2 h-12 rounded-xl bg-cyan-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
            >
              Agregar
            </button>
          </form>
          <div className="mt-3">
            <BarcodeScanner onCode={resolveBarcode} disabled={cartLocked} />
            <p className="mt-1 text-xs text-slate-500">Un lector USB/Bluetooth también funciona escribiendo el código en el campo de búsqueda y enviando Enter.</p>
          </div>

          {searchError ? (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <p>{searchError}</p>
              {search.trim() &&
              filteredOptions.length === 0 &&
              companyId &&
              authorizedUserId &&
              !cartLocked ? (
                <button
                  type="button"
                  onClick={openQuickProductEditor}
                  className="shrink-0 rounded-lg bg-amber-300 px-4 py-2 font-bold text-slate-950 transition hover:bg-amber-200"
                >
                  Registrar producto
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-3">
            <label htmlFor="pos-catalogo-activo" className="shrink-0 text-sm font-medium text-slate-200">
              Catálogo
            </label>
            <select
              id="pos-catalogo-activo"
              value={catalogId}
              onChange={(event) => {
                if (cart.length > 0) {
                  setCheckoutError('Termina o vacía la venta antes de cambiar de catálogo');
                  return;
                }
                setCatalogId(event.target.value);
                setCategoryId('all');
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="all">Todos los catálogos</option>
              {commerceCatalogs.map((catalog) => (
                <option key={catalog.id} value={catalog.id}>{catalog.name}</option>
              ))}
            </select>
            <label htmlFor="pos-categoria-activa" className="shrink-0 text-sm font-medium text-slate-200">
              Categoría
            </label>
            <select
              id="pos-categoria-activa"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {categoryId !== 'all' ? (
              <button
                type="button"
                onClick={() => setCategoryId('all')}
                className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-cyan-300 hover:border-cyan-400"
              >
                Ver todo
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-400">
              {loadingProducts
                ? 'Cargando catálogo…'
                : `${filteredOptions.length} productos disponibles`}
            </p>
            <button
              type="button"
              onClick={() => void loadProducts()}
              className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
            >
              Actualizar
            </button>
          </div>

          {catalogError ? (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
              <p className="font-semibold">No se pudo abrir el catálogo</p>
              <p className="mt-1 text-red-300/80">{catalogError}</p>
            </div>
          ) : null}

          {!catalogError && !loadingProducts && filteredOptions.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
              <p className="font-medium text-slate-300">No encontramos productos</p>
              <p className="mt-2 text-sm text-slate-500">
                Prueba con otro nombre, SKU o categoría.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredOptions.map((option) => {
              const unavailable = option.trackInventory && option.stock <= 0;

              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={unavailable || cartLocked}
                  onClick={() => addOption(option)}
                  className="group min-h-44 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-800/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/10 text-sm font-bold text-cyan-300 ring-1 ring-cyan-400/20">
                      {option.productName.slice(0, 2).toUpperCase()}
                    </div>
                    {option.featured ? (
                      <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                        Destacado
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-4 font-semibold text-white">
                    {option.productName}
                  </p>
                  <p className="mt-1 min-h-5 text-sm text-slate-400">
                    {option.variantName ?? option.categoryName}
                  </p>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold text-cyan-300">
                        {money.format(option.price)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {option.sku ?? 'Sin SKU'}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        unavailable ? 'text-red-400' : 'text-slate-400'
                      }`}
                    >
                      {option.trackInventory
                        ? unavailable
                          ? 'Agotado'
                          : `${option.stock} disponibles`
                        : 'Disponible'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="h-fit overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-slate-950/30 xl:sticky xl:top-6">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Venta actual
              </p>
              <h2 className="mt-1 text-lg font-semibold">Cliente general</h2>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300">
              {cart.reduce((total, item) => total + item.quantity, 0)} artículos
            </span>
          </div>

          {customerReceipts.length > 0 ? (
            <div className="border-b border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                    Ya pagado por este cliente
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Sigue visible, pero no volverá a cobrarse.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={finishCustomer}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Terminar atención
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {customerReceipts.flatMap((paidReceipt) =>
                  paidReceipt.items.map((item) => (
                    <div
                      key={`${paidReceipt.order.id}-${item.key}`}
                      className="flex justify-between gap-3 text-xs"
                    >
                      <span className="text-slate-400">
                        {item.quantity} × {item.productName}
                      </span>
                      <span className="font-semibold text-emerald-300">
                        Pagado
                      </span>
                    </div>
                  )),
                )}
              </div>
            </div>
          ) : null}
          <div className="max-h-[40vh] overflow-y-auto px-5 py-2 xl:max-h-[42vh]">
            {cart.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-xl text-slate-500">
                  +
                </div>
                <p className="mt-4 font-medium text-slate-300">Venta vacía</p>
                <p className="mt-1 text-sm text-slate-500">
                  Selecciona un producto para comenzar.
                </p>
              </div>
            ) : (
              cart.map((item) => {
                const lineCents = toCents(item.price * item.quantity);
                const discountCents = calculateDiscountCents(
                  item.discount,
                  lineCents,
                  item.quantity,
                );

                return (
                  <div key={item.key} className="border-b border-slate-800 py-4 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {item.productName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {item.variantName ?? item.sku ?? item.categoryName}
                        </p>
                      </div>
                      <p className="whitespace-nowrap font-semibold text-slate-100">
                        {money.format(fromCents(lineCents - discountCents))}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950/70">
                        <button
                          type="button"
                          disabled={cartLocked}
                          onClick={() => changeQuantity(item.key, -1)}
                          className="h-8 w-9 text-slate-300 hover:text-white disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={cartLocked}
                          onClick={() => changeQuantity(item.key, 1)}
                          className="h-8 w-9 text-slate-300 hover:text-white disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={cartLocked}
                        onClick={() => openDiscountEditor(item)}
                        className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 disabled:opacity-40"
                      >
                        {item.discount?.source === 'promotion'
                          ? 'Oferta automática'
                          : item.discount
                            ? 'Editar descuento'
                            : '+ Descuento'}
                      </button>
                    </div>

                    {item.discount ? (
                      <div
                        className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                          item.discount.source === 'promotion'
                            ? 'bg-amber-300/10 text-amber-100'
                            : 'bg-cyan-400/10 text-cyan-200'
                        }`}
                      >
                        <span>
                          {item.discount.type === 'percentage'
                            ? `${item.discount.value}%`
                            : item.discount.type === 'special_price'
                              ? `Precio ${money.format(item.discount.value)}`
                              : `-${money.format(item.discount.value)}`}
                          {' · '}
                          {item.discount.reason}
                        </span>
                        <button
                          type="button"
                          disabled={cartLocked}
                          onClick={() => removeDiscount(item.key)}
                          className="ml-2 font-bold text-cyan-300"
                        >
                          ×
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-950/40 p-5">
            {appliedPromotionId ? (
              <div className="mb-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                      Mejor promoción aplicada
                    </p>
                    <p className="mt-1 text-sm leading-5 text-emerald-50">
                      {promotionNotice}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={cartLocked}
                    onClick={removeAppliedPromotion}
                    className="shrink-0 rounded-lg border border-emerald-200/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-200/10 disabled:opacity-40"
                  >
                    Quitar
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-emerald-200/70">
                  Yalika usa una sola oferta para evitar descuentos duplicados.
                </p>
              </div>
            ) : bestPromotionPlan ? (
              <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
                  Yalika encontró una oferta
                </p>
                <p className="mt-1 font-semibold text-white">
                  {bestPromotionPlan.promotion.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Es la promoción vigente que más conviene. El cliente ahorra{' '}
                  <strong className="text-amber-200">
                    {money.format(bestPromotionPlan.savings)}
                  </strong>
                  .
                </p>
                <button
                  type="button"
                  disabled={cartLocked}
                  onClick={() => applyPromotion(bestPromotionPlan)}
                  className="mt-3 h-10 w-full rounded-xl bg-amber-300 text-sm font-bold text-slate-950 hover:bg-amber-200 disabled:opacity-40"
                >
                  Aplicar mejor promoción
                </button>
              </div>
            ) : promotionOpportunity ? (
              <div className="mb-4 rounded-2xl border border-violet-300/25 bg-violet-300/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
                  Oportunidad de ahorro
                </p>
                <p className="mt-1 font-semibold text-white">
                  {promotionOpportunity.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {promotionOpportunity.message}
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Descuento general</span>
              {orderDiscount ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={cartLocked}
                    onClick={() => openDiscountEditor('order')}
                    className="text-sm font-semibold text-cyan-400"
                  >
                    {orderDiscount.source === 'promotion'
                      ? 'Oferta automática'
                      : 'Editar'}
                  </button>
                  <button
                    type="button"
                    disabled={cartLocked}
                    onClick={() => removeDiscount('order')}
                    className="text-sm font-bold text-slate-500 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={cartLocked || cart.length === 0}
                  onClick={() => openDiscountEditor('order')}
                  className="text-sm font-semibold text-cyan-400 disabled:text-slate-600"
                >
                  + Agregar
                </button>
              )}
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>{money.format(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-300">
                <span>Descuentos</span>
                <span>− {money.format(totals.discount)}</span>
              </div>
              <div className="mt-3 flex items-end justify-between border-t border-slate-800 pt-4">
                <span className="font-medium text-slate-300">Total</span>
                <span className="text-3xl font-bold tracking-tight text-white">
                  {money.format(totals.total)}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ['cash', 'Efectivo'],
                ['card', 'Tarjeta'],
                ['transfer', 'Transferencia'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={cartLocked}
                  onClick={() => setPaymentMethod(value)}
                  className={`rounded-xl border px-2 py-3 text-xs font-semibold transition ${
                    paymentMethod === value
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' ? (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-slate-500" htmlFor="receivedAmount">
                    Efectivo recibido
                  </label>
                  <button
                    type="button"
                    disabled={cartLocked || cart.length === 0}
                    onClick={() => {
                      setReceivedAmount(totals.total.toFixed(2));
                      setCheckoutError('');
                    }}
                    className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 disabled:text-slate-600"
                  >
                    Pago exacto
                  </button>
                </div>
                <input
                  id="receivedAmount"
                  inputMode="decimal"
                  value={receivedAmount}
                  disabled={cartLocked}
                  onChange={(event) => setReceivedAmount(event.target.value)}
                  placeholder={money.format(totals.total)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400 disabled:opacity-50"
                />
                {receivedAmount && Number(receivedAmount) >= totals.total ? (
                  <p className="mt-2 text-xs font-medium text-emerald-300">
                    Cambio estimado: {money.format(Number(receivedAmount) - totals.total)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-3">
                <label className="text-xs font-medium text-slate-500" htmlFor="paymentReference">
                  Referencia (opcional)
                </label>
                <input
                  id="paymentReference"
                  value={paymentReference}
                  disabled={cartLocked}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Últimos dígitos o folio"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400 disabled:opacity-50"
                />
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-3">
              <label
                className="text-xs font-semibold text-fuchsia-200"
                htmlFor="benefitPhone"
              >
                Teléfono para beneficios (opcional)
              </label>
              <input
                id="benefitPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={benefitPhone}
                disabled={cartLocked}
                onChange={(event) => setBenefitPhone(event.target.value)}
                placeholder="Ej. 614 123 4567"
                className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-fuchsia-400 disabled:opacity-50"
              />
              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                Si lo escribes, esta compra pagada suma su visita automáticamente.
                También podrá registrarla escaneando el QR del ticket.
              </p>
            </div>

            {checkoutError ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {checkoutError}
                {checkoutSession ? (
                  <p className="mt-1 text-xs text-red-300/75">
                    Pedido {checkoutSession.order.orderNumber}. Corrige el problema y vuelve a intentar.
                  </p>
                ) : null}
              </div>
            ) : null}

            {cart.length > 0 ? (
              <button
                type="button"
                disabled={checkingOut || cancellingSale}
                onClick={() => {
                  setCancelSaleError('');
                  setShowCancelSale(true);
                }}
                className="mt-4 w-full text-center text-sm font-semibold text-red-300 transition hover:text-red-200 disabled:text-slate-600"
              >
                {checkoutSession
                  ? 'Cancelar cobro y liberar mercancía'
                  : 'Cancelar venta'}
              </button>
            ) : null}

            <div className="mt-5 grid grid-cols-[0.85fr_1.15fr] gap-2">
              <button
                type="button"
                disabled={checkingOut || cart.length === 0 || Boolean(splitCheckout)}
                onClick={() =>
                  setSplitEditor({
                    parts: '2',
                    error: '',
                  })
                }
                className="h-14 rounded-2xl border border-cyan-400/40 bg-cyan-400/5 px-3 text-sm font-bold text-cyan-300 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
              >
                Dividir cuenta
              </button>

              <button
                type="button"
                disabled={checkingOut || cart.length === 0 || Boolean(splitCheckout)}
                onClick={() =>
                  checkoutSession
                    ? void checkout()
                    : setShowConfirmCheckout(true)
                }
                className="h-14 rounded-2xl bg-cyan-400 px-3 text-base font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                {checkingOut
                  ? 'Procesando…'
                  : checkoutSession
                    ? 'Reintentar cobro'
                    : `Cobrar ${money.format(totals.total)}`}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {showConfirmCheckout ? (
        <div className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-3xl border border-cyan-400/30 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-300">
              $
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Confirmar cobro
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              ¿Iniciar el cobro de esta venta?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Se bloquearán {cart.reduce((total, item) => total + item.quantity, 0)} artículos por un total de {money.format(totals.total)}. Ya no podrán agregarse productos durante el cobro.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmCheckout(false)}
                className="h-12 rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmCheckout(false);
                  void checkout();
                }}
                className="h-12 rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
              >
                Sí, iniciar cobro
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {splitEditor ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => void startSplitCheckout(event)}
            className="w-full max-w-md rounded-3xl border border-cyan-400/30 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Cuenta dividida
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Dividir {money.format(totals.total)}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Yalika conservará cada centavo y permitirá cobrar cada cuenta por separado.
                </p>
              </div>

              {!checkoutSession ? (
                <button
                  type="button"
                  onClick={() => setSplitEditor(undefined)}
                  className="text-2xl text-slate-500 hover:text-white"
                >
                  ×
                </button>
              ) : null}
            </div>

            <label className="mt-6 block text-sm font-medium text-slate-300" htmlFor="splitParts">
              Número de cuentas
            </label>
            <select
              id="splitParts"
              value={splitEditor.parts}
              disabled={checkingOut}
              onChange={(event) =>
                setSplitEditor({
                  parts: event.target.value,
                  error: '',
                })
              }
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm outline-none focus:border-cyan-400 disabled:opacity-50"
            >
              {Array.from({ length: 9 }, (_, index) => index + 2).map((parts) => (
                <option key={parts} value={parts}>
                  {parts} cuentas
                </option>
              ))}
            </select>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {getEqualSplitTotals(totals.total, Number(splitEditor.parts)).map(
                (amount, index) => (
                  <div
                    key={`${index}-${amount}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3"
                  >
                    <p className="text-xs text-slate-500">Cuenta {index + 1}</p>
                    <p className="mt-1 font-semibold text-cyan-300">
                      {money.format(amount)}
                    </p>
                  </div>
                ),
              )}
            </div>

            {splitEditor.error ? (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {splitEditor.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={checkingOut}
              className="mt-6 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {checkingOut ? 'Preparando cuentas…' : 'Confirmar división'}
            </button>

            {checkoutSession ? (
              <p className="mt-3 text-center text-xs text-amber-300/80">
                La venta ya fue confirmada. Reintenta la división para continuar el cobro.
              </p>
            ) : null}
          </form>
        </div>
      ) : null}

      {splitCheckout && activeSplit ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-3xl border border-cyan-400/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Cobro por cuentas
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {splitCheckout.order.orderNumber}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {paidSplitCount} de {splitCheckout.splits.length} cuentas pagadas
                </p>
              </div>

              <div className="rounded-2xl bg-slate-950 px-5 py-3 text-right">
                <p className="text-xs text-slate-500">Cobrar ahora</p>
                <p className="mt-1 text-2xl font-bold text-cyan-300">
                  {money.format(activeSplit.total)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {splitCheckout.splits.map((split) => (
                <div
                  key={split.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    split.status === 'paid'
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : split.id === activeSplit.id
                        ? 'border-cyan-400/50 bg-cyan-400/10'
                        : 'border-slate-800 bg-slate-950/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{split.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Descuento: {money.format(split.discount)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{money.format(split.total)}</p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          split.status === 'paid'
                            ? 'text-emerald-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {split.status === 'paid' ? 'Pagada' : 'Pendiente'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {[
                ['cash', 'Efectivo'],
                ['card', 'Tarjeta'],
                ['transfer', 'Transferencia'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={processingSplit}
                  onClick={() => {
                    setSplitPaymentMethod(value);
                    setSplitPaymentError('');
                  }}
                  className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                    splitPaymentMethod === value
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {splitPaymentMethod === 'cash' ? (
              <div className="mt-4">
                <label className="text-sm font-medium text-slate-300" htmlFor="splitReceivedAmount">
                  Efectivo recibido (opcional)
                </label>
                <input
                  id="splitReceivedAmount"
                  inputMode="decimal"
                  value={splitReceivedAmount}
                  disabled={processingSplit}
                  onChange={(event) => {
                    setSplitReceivedAmount(event.target.value);
                    setSplitPaymentError('');
                  }}
                  placeholder={money.format(activeSplit.total)}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
                />
                {splitReceivedAmount &&
                Number(splitReceivedAmount) >= activeSplit.total ? (
                  <p className="mt-2 text-sm font-medium text-emerald-300">
                    Cambio: {money.format(Number(splitReceivedAmount) - activeSplit.total)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4">
                <label className="text-sm font-medium text-slate-300" htmlFor="splitPaymentReference">
                  Referencia (opcional)
                </label>
                <input
                  id="splitPaymentReference"
                  value={splitPaymentReference}
                  disabled={processingSplit}
                  onChange={(event) => {
                    setSplitPaymentReference(event.target.value);
                    setSplitPaymentError('');
                  }}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
                />
              </div>
            )}

            {splitPaymentError ? (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {splitPaymentError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={processingSplit}
              onClick={() => void payCurrentSplit()}
              className="mt-6 h-14 w-full rounded-2xl bg-cyan-400 text-base font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {processingSplit
                ? 'Registrando pago…'
                : `Cobrar ${activeSplit.label} · ${money.format(activeSplit.total)}`}
            </button>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={processingSplit}
                onClick={saveSplitForLater}
                className="h-11 rounded-xl border border-slate-700 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Guardar pendiente
              </button>
              <button
                type="button"
                disabled={processingSplit || splitCheckout.payments.length > 0}
                onClick={() => {
                  setCancelSaleError('');
                  setShowCancelSale(true);
                }}
                className="h-11 rounded-xl border border-red-400/40 text-sm font-semibold text-red-300 hover:bg-red-400/10 disabled:border-slate-700 disabled:text-slate-600"
              >
                Cancelar cuenta
              </button>
            </div>

            {splitCheckout.payments.length > 0 ? (
              <p className="mt-2 text-center text-xs text-slate-500">
                Una cuenta con pagos parciales debe completarse o anularse mediante reembolso.
              </p>
            ) : null}

            <p className="mt-3 text-center text-xs text-slate-500">
              Esta ventana se cerrará cuando todas las cuentas estén pagadas.
            </p>
          </section>
        </div>
      ) : null}

      {showRewardRedeem ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <form
            onSubmit={redeemReward}
            className="w-full max-w-lg rounded-3xl border border-amber-300/25 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                  Club QR
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Entregar premio
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Si el cliente ganó, Yalika le mostró un código en su celular. No es su teléfono ni tiene que inventarlo: copia aquí ese código para entregar el premio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRewardRedeem(false)}
                className="text-2xl text-slate-500 hover:text-white"
              >
                ×
              </button>
            </div>

            <label className="mt-6 block text-sm font-medium text-slate-300">
              Código ganador creado por Yalika
              <input
                autoFocus
                value={rewardCode}
                onChange={(event) => {
                  setRewardCode(
                    event.target.value.toUpperCase(),
                  );
                  setRewardRedeemError('');
                  setRewardRedeemMessage('');
                }}
                placeholder="YALIKA-XXXXXXXXXX"
                className="mt-2 h-14 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-center font-mono text-lg font-bold uppercase tracking-wider outline-none focus:border-amber-300"
              />
            </label>

            {rewardRedeemError ? (
              <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {rewardRedeemError}
              </p>
            ) : null}
            {rewardRedeemMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
                {rewardRedeemMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={redeemingReward}
              className="mt-5 h-12 w-full rounded-xl bg-amber-300 font-bold text-amber-950 hover:bg-amber-200 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {redeemingReward
                ? 'Validando…'
                : 'Validar y marcar entregado'}
            </button>
          </form>
        </div>
      ) : null}

      {quickProductEditor ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveQuickProduct}
            className="w-full max-w-2xl rounded-3xl border border-amber-300/30 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                  Alta rápida desde caja
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Registrar producto
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Al guardar, el producto se agregará automáticamente a esta venta.
                </p>
              </div>
              <button
                type="button"
                disabled={savingQuickProduct}
                onClick={() => setQuickProductEditor(undefined)}
                className="text-2xl text-slate-500 hover:text-white disabled:opacity-50"
                aria-label="Cerrar alta rápida"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  className="block text-sm font-medium text-slate-300"
                  htmlFor="quickProductName"
                >
                  Nombre del producto
                </label>
                <input
                  id="quickProductName"
                  autoFocus
                  required
                  maxLength={180}
                  value={quickProductEditor.name}
                  onChange={(event) =>
                    setQuickProductEditor((current) =>
                      current
                        ? { ...current, name: event.target.value, error: '' }
                        : current,
                    )
                  }
                  placeholder="Ej. Refresco de cola 600 ml"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-amber-300"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-slate-300"
                  htmlFor="quickProductSku"
                >
                  Código o SKU
                </label>
                <input
                  id="quickProductSku"
                  maxLength={80}
                  value={quickProductEditor.sku}
                  onChange={(event) =>
                    setQuickProductEditor((current) =>
                      current
                        ? { ...current, sku: event.target.value, error: '' }
                        : current,
                    )
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-amber-300"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-slate-300"
                  htmlFor="quickProductType"
                >
                  Tipo
                </label>
                <select
                  id="quickProductType"
                  value={quickProductEditor.type}
                  onChange={(event) =>
                    setQuickProductEditor((current) =>
                      current
                        ? {
                            ...current,
                            type: event.target.value as QuickProductEditor['type'],
                            error: '',
                          }
                        : current,
                    )
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-amber-300"
                >
                  <option value="product">Producto</option>
                  <option value="beverage">Bebida</option>
                  <option value="food">Alimento</option>
                  <option value="service">Servicio</option>
                  <option value="design">Diseño</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-slate-300"
                  htmlFor="quickProductPrice"
                >
                  Precio de venta
                </label>
                <input
                  id="quickProductPrice"
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  inputMode="decimal"
                  value={quickProductEditor.price}
                  onChange={(event) =>
                    setQuickProductEditor((current) =>
                      current
                        ? { ...current, price: event.target.value, error: '' }
                        : current,
                    )
                  }
                  placeholder="0.00"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-lg font-semibold outline-none focus:border-amber-300"
                />
              </div>

              {categories.length > 0 ? (
                <div>
                  <label
                    className="block text-sm font-medium text-slate-300"
                    htmlFor="quickProductCategory"
                  >
                    Categoría (opcional)
                  </label>
                  <select
                    id="quickProductCategory"
                    value={quickProductEditor.categoryId}
                    onChange={(event) =>
                      setQuickProductEditor((current) =>
                        current
                          ? {
                              ...current,
                              categoryId: event.target.value,
                              error: '',
                            }
                          : current,
                      )
                    }
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-amber-300"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className={categories.length === 0 ? 'sm:col-span-2' : ''}>
                <label className="flex h-12 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={quickProductEditor.trackInventory}
                    onChange={(event) =>
                      setQuickProductEditor((current) =>
                        current
                          ? {
                              ...current,
                              trackInventory: event.target.checked,
                              error: '',
                            }
                          : current,
                      )
                    }
                    className="h-4 w-4 accent-amber-300"
                  />
                  Controlar inventario
                </label>
              </div>

              {quickProductEditor.trackInventory ? (
                <div className="sm:col-span-2">
                  <label
                    className="block text-sm font-medium text-slate-300"
                    htmlFor="quickProductStock"
                  >
                    Stock inicial
                  </label>
                  <input
                    id="quickProductStock"
                    required
                    min="1"
                    step="1"
                    type="number"
                    inputMode="numeric"
                    value={quickProductEditor.stock}
                    onChange={(event) =>
                      setQuickProductEditor((current) =>
                        current
                          ? { ...current, stock: event.target.value, error: '' }
                          : current,
                      )
                    }
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-amber-300"
                  />
                </div>
              ) : null}
            </div>

            {quickProductEditor.error ? (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                {quickProductEditor.error}
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={savingQuickProduct}
                onClick={() => setQuickProductEditor(undefined)}
                className="h-12 rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingQuickProduct}
                className="h-12 rounded-xl bg-amber-300 font-bold text-slate-950 hover:bg-amber-200 disabled:bg-slate-700 disabled:text-slate-500"
              >
                {savingQuickProduct ? 'Registrando…' : 'Registrar y agregar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {discountEditor ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveDiscount}
            className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Descuento autorizado
                </p>
                <h2 className="mt-2 text-xl font-semibold">{discountEditor.label}</h2>
              </div>
              <button
                type="button"
                onClick={() => setDiscountEditor(undefined)}
                className="text-2xl text-slate-500 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {[
                ['percentage', 'Porcentaje'],
                ['fixed', 'Monto fijo'],
                ...(discountEditor.targetKey === 'order'
                  ? []
                  : [['special_price', 'Precio especial']]),
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setDiscountEditor((current) =>
                      current
                        ? {
                            ...current,
                            type: value as DiscountType,
                            error: '',
                          }
                        : current,
                    )
                  }
                  className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                    discountEditor.type === value
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-300" htmlFor="discountValue">
              {discountEditor.type === 'percentage'
                ? 'Porcentaje'
                : discountEditor.type === 'special_price'
                  ? 'Nuevo precio por unidad'
                  : 'Importe del descuento'}
            </label>
            <input
              id="discountValue"
              required
              min="0.01"
              max={discountEditor.type === 'percentage' ? '100' : undefined}
              step="0.01"
              type="number"
              value={discountEditor.value}
              onChange={(event) =>
                setDiscountEditor((current) =>
                  current
                    ? { ...current, value: event.target.value, error: '' }
                    : current,
                )
              }
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-lg font-semibold outline-none focus:border-cyan-400"
            />

            <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="discountReason">
              Motivo obligatorio
            </label>
            <input
              id="discountReason"
              required
              maxLength={180}
              value={discountEditor.reason}
              onChange={(event) =>
                setDiscountEditor((current) =>
                  current
                    ? { ...current, reason: event.target.value, error: '' }
                    : current,
                )
              }
              placeholder="Ej. Cliente frecuente"
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm outline-none focus:border-cyan-400"
            />

            {discountEditor.error ? (
              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {discountEditor.error}
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-6 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
            >
              Aplicar descuento
            </button>
          </form>
        </div>
      ) : null}

      {receipt ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm">
          <section
            data-print-ticket
            className="w-full max-w-md rounded-3xl border border-emerald-500/30 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-2xl font-bold text-slate-950">
              ✓
            </div>
            <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Venta completada
            </p>
            <h2 className="mt-2 text-center text-2xl font-semibold">
              {receipt.order.orderNumber}
            </h2>

            <div className="mt-6 space-y-3 border-y border-slate-800 py-5 text-sm">
              {receipt.items.map((item) => (
                <div key={item.key} className="flex justify-between gap-4">
                  <span className="text-slate-400">
                    {item.quantity} × {item.productName}
                  </span>
                  <span>{money.format(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>{money.format(receipt.order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-300">
                <span>Descuentos</span>
                <span>− {money.format(receipt.order.discount)}</span>
              </div>
              <div className="flex items-end justify-between border-t border-slate-800 pt-4">
                <span>Total pagado</span>
                <span className="text-3xl font-bold">
                  {money.format(receipt.order.total)}
                </span>
              </div>
              {receipt.payment.summary.changeAmount > 0 ? (
                <div className="flex justify-between rounded-xl bg-amber-400/10 px-3 py-3 font-semibold text-amber-300">
                  <span>Cambio</span>
                  <span>{money.format(receipt.payment.summary.changeAmount)}</span>
                </div>
              ) : null}
            </div>

            {receipt.payment.loyalty ? (
              <div className="mt-5 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-200">
                  Club de beneficios
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  Visita {receipt.payment.loyalty.confirmedVisits} de{' '}
                  {receipt.payment.loyalty.requiredVisits}
                </p>
                <p className="mt-1 text-xs text-fuchsia-100/80">
                  {receipt.payment.loyalty.remainingVisits === 0
                    ? '¡Beneficio desbloqueado!'
                    : `Le faltan ${receipt.payment.loyalty.remainingVisits} visita(s) para su recompensa.`}
                </p>
              </div>
            ) : null}

            {receipt.payment.benefitClaim ? (
              <div className="mt-5 text-center">
                {receiptQrDataUrl ? (
                  <img
                    src={receiptQrDataUrl}
                    alt="QR único de esta compra pagada"
                    className="mx-auto h-44 w-44 rounded-xl bg-white p-2"
                  />
                ) : (
                  <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-xl bg-white p-4 text-xs text-slate-600">
                    Preparando QR…
                  </div>
                )}
                <p className="mx-auto mt-3 max-w-xs text-xs leading-5 text-slate-300">
                  {receipt.payment.loyalty
                    ? 'Escanea para consultar los beneficios de esta compra.'
                    : 'Escanea este ticket pagado para registrar la visita. Solo puede asociarse a un teléfono.'}
                </p>
              </div>
            ) : null}

            <p className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-3 text-center text-xs leading-5 text-cyan-100/80 print:hidden">
              Imprime y termina para volver a la caja. Si el cliente desea otro
              producto, crea una venta adicional sin alterar este pago.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 print:hidden">
              <button
                type="button"
                onClick={printAndFinishCustomer}
                className="col-span-2 h-12 rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
              >
                Imprimir y terminar venta
              </button>
              <button
                type="button"
                onClick={finishCustomer}
                className="h-12 rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800"
              >
                Terminar sin imprimir
              </button>
              <button
                type="button"
                onClick={newSale}
                className="h-12 rounded-xl border border-cyan-400/40 font-semibold text-cyan-300 hover:bg-cyan-400/10"
              >
                Agregar otro producto
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoidPaidSaleError('');
                  setVoidReason('');
                  setVoidMerchandiseConfirmed(false);
                  setShowVoidPaidSale(true);
                }}
                className="col-span-2 mt-1 text-sm font-semibold text-red-300 hover:text-red-200"
              >
                Anular antes de entregar mercancía
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showVoidPaidSale && receipt ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-3xl border border-red-400/30 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-400/10 text-2xl text-red-300">
              ↶
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
              Anular cobro pagado
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              ¿El cliente se arrepintió en caja?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Usa esta opción solamente si el ticket y la mercancía aún no se
              entregaron. Yalika reembolsará {money.format(receipt.order.total)},
              repondrá los productos vendibles y conservará la operación en
              auditoría.
            </p>
            <label className="mt-5 block text-left text-sm font-medium text-slate-300">
              Motivo obligatorio
              <select
                value={voidReason}
                disabled={voidingPaidSale}
                onChange={(event) => {
                  setVoidReason(event.target.value);
                  setVoidPaidSaleError('');
                }}
                className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 outline-none focus:border-red-400"
              >
                <option value="">Selecciona un motivo</option>
                <option value="customer_changed_mind">
                  Cliente se arrepintió antes de recibir
                </option>
                <option value="order_error">Error al realizar el cobro</option>
                <option value="wrong_item">Producto registrado incorrectamente</option>
                <option value="other">Otro motivo autorizado</option>
              </select>
            </label>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-left text-sm text-slate-300">
              <input
                type="checkbox"
                checked={voidMerchandiseConfirmed}
                disabled={voidingPaidSale}
                onChange={(event) => {
                  setVoidMerchandiseConfirmed(event.target.checked);
                  setVoidPaidSaleError('');
                }}
                className="mt-1 h-4 w-4 accent-red-400"
              />
              <span>
                Confirmo que toda la mercancía continúa físicamente en caja y
                no fue entregada al cliente.
              </span>
            </label>
            {voidPaidSaleError ? (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                {voidPaidSaleError}
              </p>
            ) : null}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={voidingPaidSale}
                onClick={() => {
                  setShowVoidPaidSale(false);
                  setVoidReason('');
                  setVoidMerchandiseConfirmed(false);
                  setVoidPaidSaleError('');
                }}
                className="h-12 rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Conservar venta
              </button>
              <button
                type="button"
                disabled={
                  voidingPaidSale ||
                  !voidReason ||
                  !voidMerchandiseConfirmed
                }
                onClick={() => void voidPaidSale()}
                className="h-12 rounded-xl bg-red-400 font-bold text-slate-950 hover:bg-red-300 disabled:opacity-50"
              >
                {voidingPaidSale ? 'Anulando…' : 'Sí, anular y reponer'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showCancelSale ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-3xl border border-red-400/30 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-400/10 text-2xl text-red-300">
              ×
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
              Cancelar venta actual
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              ¿El cliente ya no comprará?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {checkoutSession || splitCheckout
                ? 'Se cancelará el cobro y la mercancía reservada volverá al inventario. El movimiento quedará únicamente en auditoría.'
                : 'Se vaciará el carrito. No se registrará pago ni se descontará inventario.'}
            </p>
            {cancelSaleError ? (
              <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                {cancelSaleError}
              </p>
            ) : null}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={cancellingSale}
                onClick={() => setShowCancelSale(false)}
                className="h-12 rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Continuar venta
              </button>
              <button
                type="button"
                disabled={cancellingSale}
                onClick={() => void cancelCurrentSale()}
                className="h-12 rounded-xl bg-red-400 font-bold text-slate-950 hover:bg-red-300 disabled:opacity-50"
              >
                {cancellingSale
                  ? 'Cancelando…'
                  : checkoutSession || splitCheckout
                    ? 'Sí, cancelar y liberar'
                    : 'Sí, cancelar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
