-- Stripe billing is deliberately separate from the existing credit ledger.
-- A verified provider payment is recorded here first; the same transaction then
-- calls apply_credit_entry so money, credits and profile state cannot diverge.

create table if not exists billing_customers (
  id text primary key,
  user_id text not null,
  stripe_customer_id text,
  status text not null default 'provisioning',
  livemode boolean not null default false,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_id_mode_uq unique (id, livemode),
  constraint billing_customers_user_mode_uq unique (user_id, livemode),
  constraint billing_customers_stripe_mode_uq unique (stripe_customer_id, livemode),
  constraint billing_customers_status_ck
    check (status in ('provisioning', 'ready', 'error'))
);

create table if not exists billing_checkout_requests (
  id text primary key,
  user_id text not null,
  client_request_id text not null,
  kind text not null,
  sku text not null,
  stripe_price_id text not null,
  request_fingerprint text not null,
  status text not null default 'creating',
  billing_customer_id text not null,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_checkout_url text,
  expected_amount_minor bigint not null,
  expected_currency text not null,
  expected_credits integer not null,
  livemode boolean not null default false,
  expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_checkout_requests_id_mode_uq unique (id, livemode),
  constraint billing_checkout_requests_client_key_uq
    unique (user_id, client_request_id, livemode),
  constraint billing_checkout_requests_session_mode_uq
    unique (stripe_checkout_session_id, livemode),
  constraint billing_checkout_requests_customer_mode_fk
    foreign key (billing_customer_id, livemode)
    references billing_customers (id, livemode),
  constraint billing_checkout_requests_kind_ck
    check (kind in ('subscription', 'topup')),
  constraint billing_checkout_requests_status_ck
    check (status in ('creating', 'open', 'awaiting_payment', 'completed', 'expired', 'failed')),
  constraint billing_checkout_requests_money_ck
    check (
      expected_amount_minor > 0
      and expected_currency ~ '^[a-z]{3}$'
      and expected_credits > 0
      and stripe_price_id ~ '^price_[A-Za-z0-9]+$'
    )
);

create index if not exists billing_checkout_requests_user_id_idx
  on billing_checkout_requests (user_id, created_at desc);

-- Prevent two concurrent clicks from creating two paid subscriptions. A
-- cancelled/expired session leaves this index and can be replaced safely.
create unique index if not exists billing_checkout_one_open_subscription_idx
  on billing_checkout_requests (user_id, livemode)
  where kind = 'subscription' and status in ('creating', 'open', 'awaiting_payment');

create table if not exists billing_subscriptions (
  stripe_subscription_id text not null,
  checkout_request_id text not null,
  user_id text not null,
  billing_customer_id text not null,
  stripe_customer_id text not null,
  plan text not null,
  stripe_price_id text not null,
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  livemode boolean not null default false,
  last_event_created bigint not null default 0,
  last_event_id text not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_pkey primary key (stripe_subscription_id, livemode),
  constraint billing_subscriptions_checkout_mode_uq unique (checkout_request_id, livemode),
  constraint billing_subscriptions_checkout_mode_fk
    foreign key (checkout_request_id, livemode)
    references billing_checkout_requests (id, livemode),
  constraint billing_subscriptions_customer_mode_fk
    foreign key (billing_customer_id, livemode)
    references billing_customers (id, livemode),
  constraint billing_subscriptions_plan_ck
    check (plan in ('standard', 'pro', 'team')),
  constraint billing_subscriptions_status_ck
    check (
      status in (
        'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
        'canceled', 'unpaid', 'paused'
      )
    )
);

create index if not exists billing_subscriptions_user_id_idx
  on billing_subscriptions (user_id, updated_at desc);

create unique index if not exists billing_subscriptions_one_current_idx
  on billing_subscriptions (user_id, livemode)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');

create table if not exists payment_ledger (
  id bigserial primary key,
  provider text not null default 'stripe',
  kind text not null,
  provider_object_id text not null,
  livemode boolean not null,
  user_id text not null,
  status text not null,
  amount_minor bigint not null,
  currency text not null,
  credits integer not null default 0,
  plan text,
  stripe_event_id text not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  stripe_subscription_id text,
  stripe_charge_id text,
  receipt_url text,
  hosted_invoice_url text,
  invoice_pdf_url text,
  credit_ledger_entry_id integer references credit_ledger (id),
  provider_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_ledger_provider_object_uq
    unique (provider, kind, provider_object_id, livemode),
  constraint payment_ledger_provider_ck check (provider = 'stripe'),
  constraint payment_ledger_kind_ck
    check (kind in ('topup', 'subscription_invoice')),
  constraint payment_ledger_status_ck
    check (status in ('pending', 'paid', 'failed', 'action_required', 'void')),
  constraint payment_ledger_money_ck
    check (amount_minor >= 0 and currency ~ '^[a-z]{3}$' and credits >= 0),
  constraint payment_ledger_plan_ck
    check (plan is null or plan in ('standard', 'pro', 'team'))
);

create index if not exists payment_ledger_user_id_idx
  on payment_ledger (user_id, created_at desc);

create unique index if not exists payment_ledger_stripe_invoice_idx
  on payment_ledger (stripe_invoice_id, livemode)
  where stripe_invoice_id is not null;

create unique index if not exists payment_ledger_stripe_checkout_idx
  on payment_ledger (stripe_checkout_session_id, livemode)
  where stripe_checkout_session_id is not null and kind = 'topup';

create unique index if not exists payment_ledger_stripe_payment_intent_idx
  on payment_ledger (stripe_payment_intent_id, livemode)
  where stripe_payment_intent_id is not null;

create unique index if not exists payment_ledger_stripe_charge_idx
  on payment_ledger (stripe_charge_id, livemode)
  where stripe_charge_id is not null;

create table if not exists stripe_webhook_events (
  event_id text not null,
  event_type text not null,
  object_id text,
  api_version text,
  livemode boolean not null,
  provider_created bigint not null,
  signature_verified_at timestamptz not null,
  payload text,
  payload_sha256 text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_pkey primary key (event_id, livemode),
  constraint stripe_webhook_events_status_ck
    check (status in ('queued', 'processing', 'retry', 'processed', 'ignored', 'manual_review')),
  constraint stripe_webhook_events_attempt_ck
    check (attempt_count >= 0 and max_attempts between 1 and 20),
  constraint stripe_webhook_events_payload_hash_ck
    check (payload_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists stripe_webhook_events_dispatch_idx
  on stripe_webhook_events (status, available_at, lease_expires_at);

-- Compatibility normalization for databases that applied an earlier draft of
-- this migration. Stripe object ids only identify an object inside one mode;
-- every provider-facing uniqueness boundary therefore includes livemode.
alter table billing_subscriptions
  add column if not exists checkout_request_id text;
alter table payment_ledger
  add column if not exists livemode boolean;

update payment_ledger as payment
set livemode = event.livemode
from stripe_webhook_events as event
where payment.livemode is null
  and event.event_id = payment.stripe_event_id;
do $$
begin
  if exists (select 1 from payment_ledger where livemode is null) then
    raise exception using errcode = 'P0001',
      message = 'PAYMENT_LEDGER_MODE_RECONCILIATION_REQUIRED';
  end if;
end;
$$;
alter table payment_ledger alter column livemode set not null;
alter table payment_ledger alter column livemode drop default;

alter table billing_customers
  drop constraint if exists billing_customers_user_id_key;
alter table billing_customers
  drop constraint if exists billing_customers_stripe_customer_id_key;
create unique index if not exists billing_customers_id_mode_idx
  on billing_customers (id, livemode);
create unique index if not exists billing_customers_user_mode_idx
  on billing_customers (user_id, livemode);
create unique index if not exists billing_customers_stripe_mode_idx
  on billing_customers (stripe_customer_id, livemode)
  where stripe_customer_id is not null;

alter table billing_checkout_requests
  drop constraint if exists billing_checkout_requests_client_key_uq;
alter table billing_checkout_requests
  drop constraint if exists billing_checkout_requests_stripe_checkout_session_id_key;
alter table billing_checkout_requests
  drop constraint if exists billing_checkout_requests_billing_customer_id_fkey;
drop index if exists billing_checkout_one_open_subscription_idx;
create unique index if not exists billing_checkout_requests_id_mode_idx
  on billing_checkout_requests (id, livemode);
create unique index if not exists billing_checkout_requests_client_mode_idx
  on billing_checkout_requests (user_id, client_request_id, livemode);
create unique index if not exists billing_checkout_requests_session_mode_idx
  on billing_checkout_requests (stripe_checkout_session_id, livemode)
  where stripe_checkout_session_id is not null;
create unique index if not exists billing_checkout_one_open_subscription_idx
  on billing_checkout_requests (user_id, livemode)
  where kind = 'subscription' and status in ('creating', 'open', 'awaiting_payment');

alter table billing_subscriptions
  drop constraint if exists billing_subscriptions_billing_customer_id_fkey;
alter table billing_subscriptions
  drop constraint if exists billing_subscriptions_pkey;
alter table billing_subscriptions
  add constraint billing_subscriptions_pkey
  primary key (stripe_subscription_id, livemode);
drop index if exists billing_subscriptions_one_current_idx;
create unique index if not exists billing_subscriptions_checkout_mode_idx
  on billing_subscriptions (checkout_request_id, livemode)
  where checkout_request_id is not null;
create unique index if not exists billing_subscriptions_one_current_idx
  on billing_subscriptions (user_id, livemode)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');

alter table payment_ledger
  drop constraint if exists payment_ledger_provider_object_uq;
drop index if exists payment_ledger_stripe_invoice_idx;
drop index if exists payment_ledger_stripe_checkout_idx;
drop index if exists payment_ledger_stripe_payment_intent_idx;
drop index if exists payment_ledger_stripe_charge_idx;
create unique index if not exists payment_ledger_provider_object_mode_idx
  on payment_ledger (provider, kind, provider_object_id, livemode);
create unique index if not exists payment_ledger_stripe_invoice_idx
  on payment_ledger (stripe_invoice_id, livemode)
  where stripe_invoice_id is not null;
create unique index if not exists payment_ledger_stripe_checkout_idx
  on payment_ledger (stripe_checkout_session_id, livemode)
  where stripe_checkout_session_id is not null and kind = 'topup';
create unique index if not exists payment_ledger_stripe_payment_intent_idx
  on payment_ledger (stripe_payment_intent_id, livemode)
  where stripe_payment_intent_id is not null;
create unique index if not exists payment_ledger_stripe_charge_idx
  on payment_ledger (stripe_charge_id, livemode)
  where stripe_charge_id is not null;

-- The two Stripe environments can produce the same textual event id. Replace
-- the legacy event-only primary key before any mode-aware dependent tables are
-- created below. The catalog guard keeps reruns safe once foreign keys depend
-- on the already-correct composite key.
do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conname = 'stripe_webhook_events_pkey'
    and conrelid = 'stripe_webhook_events'::regclass;
  if v_definition is not null
    and v_definition not like 'PRIMARY KEY (event_id, livemode)%'
  then
    alter table stripe_webhook_events
      drop constraint stripe_webhook_events_pkey;
    v_definition := null;
  end if;
  if v_definition is null then
    alter table stripe_webhook_events
      add constraint stripe_webhook_events_pkey primary key (event_id, livemode);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_checkout_requests_customer_mode_fk'
      and conrelid = 'billing_checkout_requests'::regclass
  ) then
    alter table billing_checkout_requests
      add constraint billing_checkout_requests_customer_mode_fk
      foreign key (billing_customer_id, livemode)
      references billing_customers (id, livemode) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_subscriptions_checkout_mode_fk'
      and conrelid = 'billing_subscriptions'::regclass
  ) then
    alter table billing_subscriptions
      add constraint billing_subscriptions_checkout_mode_fk
      foreign key (checkout_request_id, livemode)
      references billing_checkout_requests (id, livemode) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_subscriptions_customer_mode_fk'
      and conrelid = 'billing_subscriptions'::regclass
  ) then
    alter table billing_subscriptions
      add constraint billing_subscriptions_customer_mode_fk
      foreign key (billing_customer_id, livemode)
      references billing_customers (id, livemode) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_subscriptions_checkout_required_ck'
      and conrelid = 'billing_subscriptions'::regclass
  ) then
    alter table billing_subscriptions
      add constraint billing_subscriptions_checkout_required_ck
      check (checkout_request_id is not null) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_ledger_event_mode_fk'
      and conrelid = 'payment_ledger'::regclass
  ) then
    alter table payment_ledger
      add constraint payment_ledger_event_mode_fk
      foreign key (stripe_event_id, livemode)
      references stripe_webhook_events (event_id, livemode) not valid;
  end if;
end;
$$;

create or replace function protect_billing_subscription_identity()
returns trigger
language plpgsql
as $$
begin
  if new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.livemode is distinct from old.livemode
    or new.user_id is distinct from old.user_id
    or new.billing_customer_id is distinct from old.billing_customer_id
    or (
      old.checkout_request_id is not null
      and new.checkout_request_id is distinct from old.checkout_request_id
    )
  then
    raise exception using errcode = 'P0001',
      message = 'BILLING_SUBSCRIPTION_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_subscription_identity_immutable
  on billing_subscriptions;
create trigger billing_subscription_identity_immutable
before update on billing_subscriptions
for each row execute function protect_billing_subscription_identity();

-- Invoice creation for one-off Checkout sessions can emit invoice.paid before
-- or after checkout.session.completed. This receipt record preserves the
-- invoice independently, then reconciles it with the single payment entry.
create table if not exists stripe_invoice_receipts (
  stripe_invoice_id text not null,
  livemode boolean not null,
  checkout_request_id text not null,
  stripe_event_id text not null,
  stripe_customer_id text not null,
  amount_paid_minor bigint not null,
  currency text not null,
  hosted_invoice_url text,
  invoice_pdf_url text,
  payment_ledger_id bigint references payment_ledger (id),
  provider_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_invoice_receipts_pkey primary key (stripe_invoice_id, livemode),
  constraint stripe_invoice_receipts_checkout_mode_uq
    unique (checkout_request_id, livemode),
  constraint stripe_invoice_receipts_checkout_mode_fk
    foreign key (checkout_request_id, livemode)
    references billing_checkout_requests (id, livemode),
  constraint stripe_invoice_receipts_event_mode_fk
    foreign key (stripe_event_id, livemode)
    references stripe_webhook_events (event_id, livemode),
  constraint stripe_invoice_receipts_money_ck
    check (amount_paid_minor > 0 and currency ~ '^[a-z]{3}$')
);

-- Refunds and disputes need a separately approved economic policy. The event
-- is retained for manual review and this table structurally forbids claiming
-- that an automatic credit mutation occurred.
create table if not exists stripe_financial_adjustment_reviews (
  stripe_event_id text not null,
  livemode boolean not null,
  event_type text not null,
  provider_object_id text not null,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  payment_ledger_id bigint references payment_ledger (id),
  user_id text,
  amount_minor bigint,
  currency text,
  reason text,
  review_status text not null default 'manual_review',
  policy_decision text not null default 'not_evaluated',
  automatic_credit_action boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_financial_adjustment_reviews_pkey
    primary key (stripe_event_id, livemode),
  constraint stripe_financial_adjustment_reviews_event_mode_fk
    foreign key (stripe_event_id, livemode)
    references stripe_webhook_events (event_id, livemode),
  constraint stripe_financial_adjustment_reviews_status_ck
    check (review_status in ('manual_review', 'resolved_no_action', 'resolved_external_action')),
  constraint stripe_financial_adjustment_reviews_policy_ck
    check (policy_decision in ('not_evaluated', 'approved_no_action', 'approved_external_action')),
  constraint stripe_financial_adjustment_reviews_no_automatic_credit_ck
    check (automatic_credit_action = false),
  constraint stripe_financial_adjustment_reviews_money_ck
    check (
      amount_minor is null or (
        amount_minor >= 0 and currency is not null and currency ~ '^[a-z]{3}$'
      )
    )
);

-- Apply a verified Stripe credit exactly once. Type/amount/ownership checks
-- happen in the signed-event processor; this function is the final atomic
-- financial boundary and refuses a conflicting economic replay.
drop function if exists apply_verified_stripe_credit(
  text, text, text, text, bigint, text, integer, text, text,
  text, text, text, text, text, text, text, timestamptz, text
);
create or replace function apply_verified_stripe_credit(
  p_event_id text,
  p_kind text,
  p_provider_object_id text,
  p_user_id text,
  p_amount_minor bigint,
  p_currency text,
  p_credits integer,
  p_plan text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_invoice_id text,
  p_subscription_id text,
  p_charge_id text,
  p_receipt_url text,
  p_hosted_invoice_url text,
  p_invoice_pdf_url text,
  p_provider_created_at timestamptz,
  p_livemode boolean,
  p_note text
)
returns table (
  was_applied boolean,
  balance_after integer,
  payment_entry_id bigint,
  credit_entry_id integer
)
language plpgsql
as $$
declare
  v_payment_id bigint;
  v_existing payment_ledger%rowtype;
  v_credit record;
  v_credit_key text;
  v_receipt stripe_invoice_receipts%rowtype;
begin
  if p_kind not in ('topup', 'subscription_invoice')
    or p_amount_minor <= 0
    or p_credits <= 0
    or p_currency !~ '^[a-z]{3}$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_VERIFIED_PAYMENT';
  end if;
  if (p_kind = 'topup' and p_plan is not null)
    or (p_kind = 'subscription_invoice' and p_plan not in ('standard', 'pro', 'team'))
  then
    raise exception using errcode = 'P0001', message = 'INVALID_VERIFIED_PAYMENT_PLAN';
  end if;

  perform 1
  from stripe_webhook_events
  where event_id = p_event_id
    and livemode = p_livemode
    and signature_verified_at is not null
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'STRIPE_EVENT_NOT_FOUND';
  end if;

  insert into payment_ledger (
    provider, kind, provider_object_id, livemode, user_id, status, amount_minor, currency,
    credits, plan, stripe_event_id, stripe_checkout_session_id,
    stripe_payment_intent_id, stripe_invoice_id, stripe_subscription_id,
    stripe_charge_id, receipt_url, hosted_invoice_url, invoice_pdf_url,
    provider_created_at
  ) values (
    'stripe', p_kind, p_provider_object_id, p_livemode, p_user_id, 'paid', p_amount_minor,
    p_currency, p_credits, p_plan, p_event_id, p_checkout_session_id,
    p_payment_intent_id, p_invoice_id, p_subscription_id, p_charge_id,
    p_receipt_url, p_hosted_invoice_url, p_invoice_pdf_url,
    p_provider_created_at
  )
  on conflict (provider, kind, provider_object_id, livemode) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select * into v_existing
    from payment_ledger
    where provider = 'stripe'
      and kind = p_kind
      and provider_object_id = p_provider_object_id
      and livemode = p_livemode
    for update;

    if not found
      or v_existing.user_id is distinct from p_user_id
      or v_existing.amount_minor is distinct from p_amount_minor
      or v_existing.currency is distinct from p_currency
      or (v_existing.credits <> 0 and v_existing.credits is distinct from p_credits)
      or v_existing.plan is distinct from p_plan
      or (
        v_existing.stripe_checkout_session_id is not null
        and p_checkout_session_id is not null
        and v_existing.stripe_checkout_session_id is distinct from p_checkout_session_id
      )
      or (
        v_existing.stripe_payment_intent_id is not null
        and p_payment_intent_id is not null
        and v_existing.stripe_payment_intent_id is distinct from p_payment_intent_id
      )
      or (
        v_existing.stripe_invoice_id is not null
        and p_invoice_id is not null
        and v_existing.stripe_invoice_id is distinct from p_invoice_id
      )
      or (
        v_existing.stripe_subscription_id is not null
        and p_subscription_id is not null
        and v_existing.stripe_subscription_id is distinct from p_subscription_id
      )
      or (
        v_existing.stripe_charge_id is not null
        and p_charge_id is not null
        and v_existing.stripe_charge_id is distinct from p_charge_id
      )
    then
      raise exception using errcode = 'P0001', message = 'STRIPE_ECONOMIC_REPLAY_CONFLICT';
    end if;
    v_payment_id := v_existing.id;
    update payment_ledger
    set status = 'paid', credits = p_credits, stripe_event_id = p_event_id,
        stripe_checkout_session_id = coalesce(
          stripe_checkout_session_id, p_checkout_session_id
        ),
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
        stripe_invoice_id = coalesce(stripe_invoice_id, p_invoice_id),
        stripe_subscription_id = coalesce(stripe_subscription_id, p_subscription_id),
        stripe_charge_id = coalesce(stripe_charge_id, p_charge_id),
        receipt_url = coalesce(p_receipt_url, receipt_url),
        hosted_invoice_url = coalesce(p_hosted_invoice_url, hosted_invoice_url),
        invoice_pdf_url = coalesce(p_invoice_pdf_url, invoice_pdf_url),
        updated_at = now()
    where id = v_payment_id;
  end if;

  v_credit_key := case
    when p_kind = 'topup' then
      'stripe:' || case when p_livemode then 'live' else 'test' end
        || ':topup:' || p_provider_object_id
    else
      'stripe:' || case when p_livemode then 'live' else 'test' end
        || ':invoice:' || p_provider_object_id
  end;
  select * into v_credit
  from apply_credit_entry(
    p_user_id,
    p_credits,
    case when p_kind = 'topup' then 'topup' else 'plan_grant' end,
    null,
    p_note,
    v_credit_key
  );

  update payment_ledger
  set credit_ledger_entry_id = v_credit.entry_id, updated_at = now()
  where id = v_payment_id;

  if p_kind = 'topup' then
    select receipt.* into v_receipt
    from stripe_invoice_receipts as receipt
    where receipt.livemode = p_livemode
      and receipt.checkout_request_id = (
        select checkout.id
        from billing_checkout_requests as checkout
        where checkout.livemode = p_livemode
          and (
            checkout.stripe_checkout_session_id = p_checkout_session_id
            or checkout.id = p_provider_object_id
          )
        limit 1
      )
      and (p_invoice_id is null or receipt.stripe_invoice_id = p_invoice_id)
    for update;
    if found then
      if v_receipt.amount_paid_minor is distinct from p_amount_minor
        or v_receipt.currency is distinct from p_currency
      then
        raise exception using errcode = 'P0001',
          message = 'STRIPE_INVOICE_RECEIPT_ECONOMIC_CONFLICT';
      end if;
      update payment_ledger
      set stripe_invoice_id = coalesce(stripe_invoice_id, v_receipt.stripe_invoice_id),
          hosted_invoice_url = coalesce(hosted_invoice_url, v_receipt.hosted_invoice_url),
          invoice_pdf_url = coalesce(invoice_pdf_url, v_receipt.invoice_pdf_url),
          updated_at = now()
      where id = v_payment_id
        and livemode = p_livemode
        and (
          stripe_invoice_id is null
          or stripe_invoice_id = v_receipt.stripe_invoice_id
        );
      if not found then
        raise exception using errcode = 'P0001',
          message = 'STRIPE_INVOICE_RECEIPT_LINK_CONFLICT';
      end if;
      update stripe_invoice_receipts
      set payment_ledger_id = v_payment_id, updated_at = now()
      where stripe_invoice_id = v_receipt.stripe_invoice_id
        and livemode = p_livemode
        and (payment_ledger_id is null or payment_ledger_id = v_payment_id);
      if not found then
        raise exception using errcode = 'P0001',
          message = 'STRIPE_INVOICE_RECEIPT_LINK_CONFLICT';
      end if;
    end if;
  end if;

  if p_plan is not null then
    -- A delayed paid invoice may arrive after a subscription was canceled.
    -- Credits still belong to a verified payment, but only the current active
    -- subscription event is allowed to activate the recurring plan.
    update profiles
    set plan = p_plan
    where user_id = p_user_id
      and exists (
        select 1
        from billing_subscriptions
        where stripe_subscription_id = p_subscription_id
          and livemode = p_livemode
          and user_id = p_user_id
          and status in ('active', 'trialing')
          and last_event_id = p_event_id
      );
  end if;

  if p_checkout_session_id is not null then
    update billing_checkout_requests
    set status = 'completed', updated_at = now(), last_error_code = null
    where livemode = p_livemode
      and (
        stripe_checkout_session_id = p_checkout_session_id
        or id = p_provider_object_id
      );
  end if;

  update stripe_webhook_events
  set status = 'processed', payload = null, processed_at = now(),
      lease_owner = null, lease_expires_at = null, last_error_code = null,
      updated_at = now()
  where event_id = p_event_id and livemode = p_livemode;

  return query
    select v_credit.was_applied, v_credit.balance_after, v_payment_id, v_credit.entry_id;
end;
$$;
