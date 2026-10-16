import {
  createMemberAccessToken,
  createTicketClaimToken,
  verifyMemberAccessToken,
  verifyTicketClaimToken,
} from './ticket-claim';

describe('ticket claim', () => {
  const orderId = 'f8267d04-3a0a-4c42-ac3a-a57b03368809';
  const companyId = '455fcf19-13ac-4a73-9c2f-a821e10c9abc';

  it('acepta el código firmado para la misma venta y empresa', () => {
    const token = createTicketClaimToken(orderId, companyId);

    expect(token).toHaveLength(64);
    expect(verifyTicketClaimToken(token, orderId, companyId)).toBe(true);
  });

  it('rechaza usar el código con otra venta', () => {
    const token = createTicketClaimToken(orderId, companyId);

    expect(
      verifyTicketClaimToken(
        token,
        '80a5f23c-2928-4a30-99a9-f8dc34d1fe47',
        companyId,
      ),
    ).toBe(false);
  });

  it('rechaza códigos manipulados', () => {
    expect(verifyTicketClaimToken('no-es-un-token', orderId, companyId)).toBe(
      false,
    );
  });

  it('protege el acceso del cliente a sus intentos', () => {
    const customerId = '97379bb2-5097-424e-93fd-8f828c72761f';
    const token = createMemberAccessToken(customerId, companyId);

    expect(verifyMemberAccessToken(token, customerId, companyId)).toBe(true);
    expect(verifyMemberAccessToken(token, orderId, companyId)).toBe(false);
  });
});
