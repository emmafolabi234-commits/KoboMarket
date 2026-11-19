# KoboMarket Backend

Express API scaffold using PostgreSQL for orders and ledger data, MongoDB for
users and catalogue data, and Redis for shared rate limits and BullMQ.

## Requirements

- Node.js 18 or newer
- PostgreSQL, MongoDB, and Redis instances reachable from this machine
- A JWT signing secret of at least 32 characters

## Setup

1. Install packages:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`),
   then set the connection strings and a unique `JWT_SECRET`. Do not commit
   `.env`.

3. Apply the PostgreSQL schema (the migration is safe to rerun):

   ```powershell
   $env:POSTGRES_URL = "postgresql://postgres:password@localhost:5432/kobomarket"
   psql $env:POSTGRES_URL -f migrations\001_init.sql
   ```

4. Run checks and start the API:

   ```sh
   npm test
   npm run dev
   ```

The server checks database and Redis connections before it listens. Startup
fails with an explicit error if a required connection string is missing or a
service is unavailable.

## Configuration

See `.env.example` for the required PostgreSQL, MongoDB, Redis, JWT, and port
settings. `JWT_SECRET` must be at least 32 characters. Optional authentication
token lifetimes can be configured with `EMAIL_VERIFICATION_TTL_MS` and
`PASSWORD_RESET_TTL_MS`.

## API routes

- Authentication: `/api/v1/auth/*`
- Products, vendors, carts, wallets, orders, disputes, payouts, notifications,
  and admin routes: `/api/<domain>/*`

All protected routes require a Bearer access token. Registration creates a
buyer; vendor access requires an approved vendor profile.

`GET /health` is an unmetered liveness check.

## Current limitations

This repository is not yet a production-ready marketplace. Wallet funding and
withdrawals, and payout requests, return `503` until verified payment-provider
flows are implemented. Checkout requires a funded wallet account. Email
verification and password-reset tokens are logged only in development; no mail
provider is configured.
Background queue definitions exist, but queue producers and worker lifecycle
management are not yet wired into the server.

Run `npm test` for the automated unit tests. PostgreSQL and MongoDB integration
tests require separately provisioned services and are not included yet.
