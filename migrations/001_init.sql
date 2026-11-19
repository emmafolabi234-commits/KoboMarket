-- 001_init.sql
-- PostgreSQL schema for KoboMarket backend (financial & order data)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. System accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_type TEXT NOT NULL CHECK (owner_type IN ('USER','SYSTEM')),
    owner_id TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    balance_kobo BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE','FROZEN')),
    CONSTRAINT accounts_balance_nonnegative CHECK (balance_kobo >= 0),
    UNIQUE (owner_type, owner_id, currency)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'accounts_balance_nonnegative'
          AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts
            ADD CONSTRAINT accounts_balance_nonnegative CHECK (balance_kobo >= 0);
    END IF;
END $$;

INSERT INTO accounts (owner_type, owner_id, currency, status)
VALUES
    ('SYSTEM', 'PLATFORM_ESCROW', 'NGN', 'ACTIVE'),
    ('SYSTEM', 'PLATFORM_REVENUE', 'NGN', 'ACTIVE'),
    ('SYSTEM', 'PLATFORM_PAYOUT_CLEARING', 'NGN', 'ACTIVE')
ON CONFLICT (owner_type, owner_id, currency) DO NOTHING;

-- 2. Ledger transaction (single balanced posting)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('POSTED')),
    idempotency_key TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Ledger entries (debit/credit)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_entries_account_created_at_idx ON ledger_entries (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_transaction_id_idx ON ledger_entries (transaction_id);

-- 4. Orders (parent order)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id TEXT NOT NULL, -- userUuid
    total_amount_kobo BIGINT NOT NULL CHECK (total_amount_kobo >= 0),
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (idempotency_key, buyer_id)
);

-- 5. Sub‑orders (per vendor)
CREATE TABLE IF NOT EXISTS sub_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL, -- userUuid of vendor
    subtotal_kobo BIGINT NOT NULL CHECK (subtotal_kobo >= 0),
    commission_rate_bps INT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','PAID','SHIPPED','DELIVERED','COMPLETED','CANCELLED','DISPUTED')),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sub_orders_commission_rate_bps_range CHECK (commission_rate_bps BETWEEN 0 AND 10000)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sub_orders_commission_rate_bps_range'
          AND conrelid = 'sub_orders'::regclass
    ) THEN
        ALTER TABLE sub_orders
            ADD CONSTRAINT sub_orders_commission_rate_bps_range
            CHECK (commission_rate_bps BETWEEN 0 AND 10000);
    END IF;
END $$;

-- 6. Order items (immutable snapshot)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sub_order_id UUID NOT NULL REFERENCES sub_orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    variant_id TEXT,
    product_name_snapshot TEXT NOT NULL,
    unit_price_kobo BIGINT NOT NULL CHECK (unit_price_kobo >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items (product_id);
CREATE INDEX IF NOT EXISTS sub_orders_vendor_status_idx ON sub_orders (vendor_id, status);

-- 7. Disputes (one per sub‑order)
CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sub_order_id UUID NOT NULL UNIQUE REFERENCES sub_orders(id) ON DELETE RESTRICT,
    opened_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence JSONB,
    status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED','REJECTED')),
    resolution TEXT,
    refund_amount_kobo BIGINT CHECK (refund_amount_kobo >= 0),
    resolved_by TEXT,
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- 8. Payouts
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id TEXT NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id),
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo >= 100000), -- minimum 1,000 NGN
    status TEXT NOT NULL CHECK (status IN ('PENDING','SUCCESS','FAILED')),
    provider_reference TEXT NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payouts_one_pending_per_vendor
    ON payouts (vendor_id) WHERE status = 'PENDING';

-- 9. Idempotency records (API level)
CREATE TABLE IF NOT EXISTS idempotency_records (
    idempotency_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_code INT NOT NULL,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (idempotency_key, user_id, endpoint)
);

-- 10. Outbox events (for async side‑effects)
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','PROCESSED','FAILED')),
    retries INT NOT NULL DEFAULT 0,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Checkout saga record (durable coordination)
CREATE TABLE IF NOT EXISTS checkout_sagas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('RESERVING','COMMITTED','COMPENSATION_REQUIRED','FAILED')),
    reservation_items JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (buyer_id, idempotency_key)
);

-- Invariants (comments for reference)
-- 1. Every posted transaction must have at least two ledger entries with debits = credits.
-- 2. Ledger entries are append‑only; never UPDATE/DELETE.
-- 3. Account rows locked in deterministic UUID order within a transaction.
-- 4. Cached balance never negative; frozen accounts cannot be debited.

-- End of migration
COMMIT;
