export const BLOCKING_RESERVATION_STATUSES = [
  'hold',
  'deposit_reported',
  'active',
  'review_expired',
] as const;

export type BlockingReservationStatus =
  (typeof BLOCKING_RESERVATION_STATUSES)[number];

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateDeposit(
  total: number,
  required: boolean,
  type: string,
  value: number,
) {
  if (!required) return 0;
  if (!Number.isFinite(total) || total < 0) return 0;
  if (!Number.isFinite(value) || value < 0) return 0;

  if (type === 'percentage') {
    return roundMoney(Math.min(total, total * (value / 100)));
  }

  return roundMoney(Math.min(total, value));
}

export function availableQuantity(stock: number, reserved: number) {
  if (!Number.isFinite(stock) || !Number.isFinite(reserved)) return 0;
  return Math.max(Math.floor(stock) - Math.max(Math.floor(reserved), 0), 0);
}

export function nextStatusAfterPickupDeadline(
  status: string,
  pickupDeadline: Date | null,
  now = new Date(),
) {
  if (
    status === 'active' &&
    pickupDeadline &&
    pickupDeadline.getTime() <= now.getTime()
  ) {
    return 'review_expired';
  }
  return status;
}

export function isBlockingReservationStatus(status: string) {
  return BLOCKING_RESERVATION_STATUSES.includes(
    status as BlockingReservationStatus,
  );
}
