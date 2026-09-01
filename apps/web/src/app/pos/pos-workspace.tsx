'use client';

import Link from 'next/link';

import {
  FormEvent,
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

type DiscountEditor = {
  targetKey: 'order' | string;
  label: string;
  type: DiscountType;
  value: string;
  reason: string;
  error: string;
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
  const response = await fetch(`/api/orion/${path}`, {
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
  initialCatalogError,
}: {
  initialCompanyId: string;
  initialAuthorizedUserId: string;
  initialProducts: Product[];
  initialCatalogError: string;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [authorizedUserId, setAuthorizedUserId] = useState(
    initialAuthorizedUserId,
  );
  const [companyDraft, setCompanyDraft] = useState(initialCompanyId);
  const [userDraft, setUserDraft] = useState(initialAuthorizedUserId);
  const [showSettings, setShowSettings] = useState(
    !initialCompanyId || !initialAuthorizedUserId,
  );
  const [products, setProducts] = useState<Product[]>(
    initialProducts.filter((product) => product.status === 'active'),
  );
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [catalogError, setCatalogError] = useState(initialCatalogError);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<CartDiscount>();
  const [discountEditor, setDiscountEditor] = useState<DiscountEditor>();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession>();
  const [checkoutError, setCheckoutError] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<Receipt>();
  const [showCancelSale, setShowCancelSale] = useState(false);
  const [splitEditor, setSplitEditor] = useState<SplitEditor>();
  const [splitCheckout, setSplitCheckout] = useState<SplitCheckout>();
  const [splitPaymentMethod, setSplitPaymentMethod] = useState('cash');
  const [splitReceivedAmount, setSplitReceivedAmount] = useState('');
  const [splitPaymentReference, setSplitPaymentReference] = useState('');
  const [splitPaymentError, setSplitPaymentError] = useState('');
  const [processingSplit, setProcessingSplit] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  async function loadProducts(targetCompanyId = companyId) {
    if (!targetCompanyId) {
      setProducts([]);
      return;
    }

    setLoadingProducts(true);
    setCatalogError('');

    try {
      const catalog = await apiRequest<Product[]>(
        `catalog/product/company/${targetCompanyId}`,
      );
      setProducts(catalog.filter((product) => product.status === 'active'));
    } catch (error) {
      setProducts([]);
      setCatalogError(
        error instanceof Error ? error.message : 'No se pudo cargar el catálogo',
      );
    } finally {
      setLoadingProducts(false);
    }
  }

  const saleOptions = useMemo(() => getSaleOptions(products), [products]);
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
  const cartLocked = Boolean(checkoutSession || splitCheckout);
  const activeSplit = splitCheckout?.splits.find(
    (split) => split.status !== 'paid',
  );
  const paidSplitCount =
    splitCheckout?.splits.filter((split) => split.status === 'paid').length ?? 0;

  function addOption(option: SaleOption) {
    if (cartLocked || (option.trackInventory && option.stock <= 0)) {
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.key === option.key);

      if (existing) {
        const nextQuantity = existing.quantity + 1;

        if (option.trackInventory && nextQuantity > option.stock) {
          return current;
        }

        return current.map((item) =>
          item.key === option.key
            ? { ...item, quantity: nextQuantity }
            : item,
        );
      }

      return [...current, { ...option, quantity: 1 }];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function changeQuantity(key: string, delta: number) {
    if (cartLocked) {
      return;
    }

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
    };

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

  async function checkout() {
    if (!companyId || !authorizedUserId) {
      setCheckoutError('Configura la empresa y el usuario autorizador');
      setShowSettings(true);
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
        const order = await apiRequest<Order>('order', {
          method: 'POST',
          body: JSON.stringify({
            companyId,
            source: 'counter',
            orderType: 'counter',
            notes: 'Venta creada desde ORION Punto de Venta',
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
              source: 'manual',
              type: cartItem.discount.type,
              value: cartItem.discount.value,
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
              source: 'manual',
              type: orderDiscount.type,
              value: orderDiscount.value,
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
        error: 'Configura la empresa y el usuario autorizador',
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
        const order = await apiRequest<Order>('order', {
          method: 'POST',
          body: JSON.stringify({
            companyId,
            source: 'counter',
            orderType: 'counter',
            notes: 'Venta dividida desde ORION Punto de Venta',
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
              source: 'manual',
              type: cartItem.discount.type,
              value: cartItem.discount.value,
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
              source: 'manual',
              type: orderDiscount.type,
              value: orderDiscount.value,
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

  function saveSettings(event: FormEvent) {
    event.preventDefault();

    if (!companyDraft.trim() || !userDraft.trim()) {
      return;
    }

    const nextCompanyId = companyDraft.trim();

    setCompanyId(nextCompanyId);
    setAuthorizedUserId(userDraft.trim());
    setShowSettings(false);
    void loadProducts(nextCompanyId);
  }

  function newSale() {
    setReceipt(undefined);
    setCheckoutError('');
    setSplitEditor(undefined);
    setSplitCheckout(undefined);
    setSplitPaymentError('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function cancelCurrentSale() {
    if (checkoutSession) {
      setShowCancelSale(false);
      setCheckoutError(
        'Esta venta ya inició su cobro. Revísala en Cuentas pendientes para no perder su seguimiento.',
      );
      return;
    }

    setCart([]);
    setOrderDiscount(undefined);
    setReceivedAmount('');
    setPaymentReference('');
    setCheckoutError('');
    setShowCancelSale(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <div className="border-b border-slate-800/80 bg-slate-950/70 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              ORION / Ventas
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
              href="/pos/ventas"
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:bg-slate-800"
            >
              Historial
            </Link>
            <Link
              href="/pos/devoluciones"
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:bg-slate-800"
            >
              Devoluciones
            </Link>
            <Link
              href="/pos/cuentas"
              className="hidden rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:bg-slate-800 md:block"
            >
              Cuentas pendientes
            </Link>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
            >
              Configuración
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
              onChange={(event) => setSearch(event.target.value)}
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

          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setCategoryId('all')}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                categoryId === 'all'
                  ? 'bg-white text-slate-950'
                  : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
              }`}
            >
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                  categoryId === category.id
                    ? 'bg-white text-slate-950'
                    : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                }`}
              >
                {category.name}
              </button>
            ))}
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
                        {item.discount ? 'Editar descuento' : '+ Descuento'}
                      </button>
                    </div>

                    {item.discount ? (
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-cyan-400/10 px-3 py-2 text-xs text-cyan-200">
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
                    Editar
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
                disabled={checkingOut || cartLocked}
                onClick={() => setShowCancelSale(true)}
                className="mt-4 w-full text-center text-sm font-semibold text-red-300 transition hover:text-red-200 disabled:text-slate-600"
              >
                Cancelar venta
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
                onClick={() => void checkout()}
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
                  ORION conservará cada centavo y permitirá cobrar cada cuenta por separado.
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

            <p className="mt-3 text-center text-xs text-slate-500">
              Esta ventana se cerrará cuando todas las cuentas estén pagadas.
            </p>
          </section>
        </div>
      ) : null}

      {showSettings ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveSettings}
            className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Configuración de caja
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Conectar esta terminal</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Estos datos identifican la empresa y a la persona que autoriza descuentos.
                </p>
              </div>
              {companyId && authorizedUserId ? (
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="text-2xl text-slate-500 hover:text-white"
                >
                  ×
                </button>
              ) : null}
            </div>

            <label className="mt-6 block text-sm font-medium text-slate-300" htmlFor="companyId">
              Identificador de empresa
            </label>
            <input
              id="companyId"
              required
              value={companyDraft}
              onChange={(event) => setCompanyDraft(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm outline-none focus:border-cyan-400"
            />

            <label className="mt-4 block text-sm font-medium text-slate-300" htmlFor="authorizedUserId">
              Usuario autorizador
            </label>
            <input
              id="authorizedUserId"
              required
              value={userDraft}
              onChange={(event) => setUserDraft(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm outline-none focus:border-cyan-400"
            />

            <button
              type="submit"
              className="mt-6 h-12 w-full rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
            >
              Guardar y abrir caja
            </button>
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

            <p className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-3 text-center text-xs leading-5 text-cyan-100/80 print:hidden">
              Si el cliente desea otro producto, continúa vendiendo. ORION lo
              registrará como una venta adicional sin alterar este pago.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-12 rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800"
              >
                Imprimir
              </button>
              <button
                type="button"
                onClick={newSale}
                className="h-12 rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
              >
                Agregar producto adicional
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
              Se vaciará el carrito. No se registrará pago ni se descontará inventario.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowCancelSale(false)}
                className="h-12 rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800"
              >
                Continuar venta
              </button>
              <button
                type="button"
                onClick={cancelCurrentSale}
                className="h-12 rounded-xl bg-red-400 font-bold text-slate-950 hover:bg-red-300"
              >
                Sí, cancelar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
