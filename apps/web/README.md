This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

## ORION Punto de Venta

The commercial checkout is available at `/pos`. It connects to ORION API on
port `3000` through a same-origin server route, so the browser does not need
direct API access.

Copy `.env.example` to `.env.local` and configure:

```bash
ORION_API_URL=http://localhost:3000
ORION_COMPANY_ID=your-company-uuid
ORION_AUTHORIZED_USER_ID=your-active-user-uuid
```

The company identifies the catalog and the active user records who authorized
each discount. These two identifiers are still used by the POS pilot; ORION
Life now obtains its identity from an authenticated session.

ORION Life is available at `/life`. Its first pilot adds personal, family,
business and school spaces on top of the shared core task engine. Tasks can be
assigned, claimed, completed, reopened and postponed with an auditable activity
history. ORION Life is protected by an opaque, revocable session stored in
PostgreSQL and delivered through an HttpOnly cookie. Before the first login, an
administrator sets a password without exposing it in command history:

```bash
cd ../api
npm run auth:set-password -- return-test@orion.local
```

Then open `/login`. The browser refreshes shared work every five seconds while
the screen is open; device alarms and production real-time delivery require the
future notification layer.

The checkout supports auditable discounts, cash change, printable receipts and
equal account splitting with one recoverable payment status per part. Returns
are available at `/pos/devoluciones`, including remaining-quantity control,
inventory disposition and refunds through the original commercial flow.
Interrupted split payments can be resumed at `/pos/cuentas`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

The interface uses local system fonts so production builds do not depend on a
Google Fonts connection.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
