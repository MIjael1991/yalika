import { createHmac, timingSafeEqual } from 'node:crypto';

function ticketSecret() {
  const secret = process.env.YALIKA_TICKET_SECRET ?? process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta YALIKA_TICKET_SECRET para firmar los tickets');
  }

  return 'yalika-clave-local-solo-para-desarrollo';
}

export function createTicketClaimToken(orderId: string, companyId: string) {
  return createHmac('sha256', ticketSecret())
    .update(`${orderId}:${companyId}`)
    .digest('hex');
}

export function verifyTicketClaimToken(
  token: string,
  orderId: string,
  companyId: string,
) {
  const expected = Buffer.from(
    createTicketClaimToken(orderId, companyId),
    'utf8',
  );
  const received = Buffer.from(token.toLowerCase(), 'utf8');

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function createMemberAccessToken(customerId: string, companyId: string) {
  return createHmac('sha256', ticketSecret())
    .update(`member:${customerId}:${companyId}`)
    .digest('hex');
}

export function verifyMemberAccessToken(
  token: string,
  customerId: string,
  companyId: string,
) {
  const expected = Buffer.from(
    createMemberAccessToken(customerId, companyId),
    'utf8',
  );
  const received = Buffer.from(token.toLowerCase(), 'utf8');

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
