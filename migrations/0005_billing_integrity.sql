-- Do not conceal damage left by the legacy non-atomic debit path. A negative
-- balance must be reconciled against its ledger before this invariant can be
-- enabled; guessing a replacement balance here would corrupt financial data.
do $migration$
declare
  negative_balance_count bigint;
begin
  select count(*) into negative_balance_count
  from profiles
  where credits_balance < 0;

  if negative_balance_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'NEGATIVE_CREDIT_BALANCES_REQUIRE_RECONCILIATION',
      detail = negative_balance_count || ' profile(s) have a negative balance',
      hint = 'Reconcile each profile against credit_ledger before rerunning this migration.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'profiles'::regclass
      and conname = 'profiles_credits_balance_nonnegative'
  ) then
    alter table profiles
      add constraint profiles_credits_balance_nonnegative
      check (credits_balance >= 0);
  end if;
end
$migration$;

alter table credit_ledger
  add column if not exists idempotency_key text;

create unique index if not exists credit_ledger_user_id_idempotency_key_idx
  on credit_ledger (user_id, idempotency_key)
  where idempotency_key is not null;

-- Balance and ledger must change in the same database transaction. Keeping this
-- operation in PostgreSQL also makes duplicate concurrent requests serialize on
-- the unique idempotency key instead of relying on a server process lock.
create or replace function apply_credit_entry(
  p_user_id text,
  p_delta integer,
  p_action text,
  p_project_id text,
  p_note text,
  p_idempotency_key text
)
returns table (
  was_applied boolean,
  balance_after integer,
  entry_id integer
)
language plpgsql
as $$
declare
  v_entry_id integer;
  v_balance integer;
  v_existing credit_ledger%rowtype;
begin
  if p_delta = 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDIT_DELTA';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception using errcode = 'P0001', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  perform 1
  from profiles
  where user_id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  insert into credit_ledger (
    user_id,
    project_id,
    action,
    credits,
    note,
    idempotency_key
  )
  values (
    p_user_id,
    p_project_id,
    p_action,
    p_delta,
    p_note,
    p_idempotency_key
  )
  on conflict do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select * into v_existing
    from credit_ledger
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key;

    if not found
      or v_existing.credits is distinct from p_delta
      or v_existing.action is distinct from p_action
      or v_existing.project_id is distinct from p_project_id
    then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;

    select credits_balance into v_balance
    from profiles
    where user_id = p_user_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
    end if;

    return query select false, v_balance, v_existing.id;
    return;
  end if;

  update profiles
  set credits_balance = credits_balance + p_delta
  where user_id = p_user_id
    and (p_delta > 0 or credits_balance >= -p_delta)
  returning credits_balance into v_balance;

  if not found then
    -- Raising rolls the ledger insert back with the failed debit.
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_CREDITS';
  end if;

  return query select true, v_balance, v_entry_id;
end;
$$;
