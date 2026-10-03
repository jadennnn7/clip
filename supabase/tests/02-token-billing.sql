\set ON_ERROR_STOP on

-- Credits nach Quellminuten: Gratis-Test, Buchung, Nachkäufe, Abo-Zyklen und
-- Gratis-Exporte. Läuft über schema.sql und über den Migrationspfad.

insert into auth.users (id, email) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'credit-a@example.com'),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'credit-b@example.com');

create function pg_temp.profile(p_id uuid) returns public.profiles language sql as $$
  select * from public.profiles where id = p_id
$$;

-- Gratis-Test und Abbuchung ---------------------------------------------------
do $$
declare a constant uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
begin
  if (pg_temp.profile(a)).plan_credits <> 120 or (pg_temp.profile(a)).pack_credits <> 0 then
    raise exception 'Signup must start with the 120-credit trial';
  end if;
  if (select on_trial from public.credit_balance(a)) is distinct from true then
    raise exception 'New account must be on trial';
  end if;
  if public.charge_clip_tokens(a, 12, 'clip:one') is distinct from true then raise exception 'Valid charge rejected'; end if;
  if public.charge_clip_tokens(a, 12, 'clip:one') is distinct from true then raise exception 'Retry must report success'; end if;
  if public.charge_clip_tokens(a, 7, 'clip:one') is distinct from true then raise exception 'Charged reference must stay charged once'; end if;
  if (pg_temp.profile(a)).plan_credits <> 108 then raise exception 'Retry charged twice'; end if;
  if (select count(*) from public.clip_token_charges where user_id = a and reference = 'clip:one') <> 1 then
    raise exception 'Retry duplicated ledger entry';
  end if;
  if public.charge_clip_tokens(a, 108.01, 'clip:overdraw') is distinct from false then raise exception 'Overdraw must fail'; end if;
  if exists (select 1 from public.clip_token_charges where reference = 'clip:overdraw') then
    raise exception 'Failed charge created a ledger entry';
  end if;
  if public.charge_clip_tokens(a, 108, 'clip:exact') is distinct from true then raise exception 'Exact balance must be accepted'; end if;
  if (pg_temp.profile(a)).plan_credits <> 0 then raise exception 'Exact charge left a balance'; end if;
end;
$$;

-- Nachkäufe: eigener Topf, abgebucht wird erst das Abo-Guthaben ---------------
do $$
declare
  a constant uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
  b constant uuid := 'bbbbbbbb-2222-2222-2222-222222222222';
begin
  if public.grant_token_pack(a, 100, 'stripe:cs_a') is distinct from true then raise exception 'Pack rejected'; end if;
  if public.grant_token_pack(a, 100, 'stripe:cs_a') is distinct from false then raise exception 'Duplicate pack must be ignored'; end if;
  if (pg_temp.profile(a)).pack_credits <> 100 then raise exception 'Pack credited an incorrect amount'; end if;

  perform public.grant_token_pack(b, 100, 'stripe:cs_b');
  if public.charge_clip_tokens(b, 130, 'clip:one') is distinct from true then raise exception 'References must be scoped to the account'; end if;
  if (pg_temp.profile(b)).plan_credits <> 0 or (pg_temp.profile(b)).pack_credits <> 90 then
    raise exception 'Charge must drain plan credits before pack credits';
  end if;
end;
$$;

-- Ungültige Eingaben ----------------------------------------------------------
do $$
declare v_amount numeric;
begin
  foreach v_amount in array array[null::numeric, 0, -1, 0.001, 'NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric] loop
    begin
      perform public.charge_clip_tokens('bbbbbbbb-2222-2222-2222-222222222222', v_amount, 'clip:invalid');
      raise exception 'Invalid credit amount accepted: %', v_amount;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.charge_clip_tokens('bbbbbbbb-2222-2222-2222-222222222222', 1, '   ');
    raise exception 'Empty reference accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.charge_clip_tokens('cccccccc-3333-3333-3333-333333333333', 1, 'clip:no-profile');
    raise exception 'Missing profile must raise a technical error';
  exception when no_data_found then null;
  end;
  begin
    perform public.grant_token_pack('bbbbbbbb-2222-2222-2222-222222222222', 1.5, 'stripe:fraction');
    raise exception 'Fractional pack accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Eine Exception rollt Guthaben und Buchungsliste gemeinsam zurück.
do $$
begin
  begin
    perform public.charge_clip_tokens('bbbbbbbb-2222-2222-2222-222222222222', 1, 'clip:rollback');
    raise exception using errcode = 'P1001', message = 'simulate later transaction error';
  exception when sqlstate 'P1001' then null;
  end;
  if exists (select 1 from public.clip_token_charges where reference = 'clip:rollback')
     or (pg_temp.profile('bbbbbbbb-2222-2222-2222-222222222222')).pack_credits <> 90 then
    raise exception 'Balance/ledger did not roll back together';
  end if;
end;
$$;

-- Gratis-Exporte --------------------------------------------------------------
do $$
declare a constant uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
begin
  if not public.consume_trial_export(a, 'render:1', 3) or not public.consume_trial_export(a, 'render:2', 3)
     or not public.consume_trial_export(a, 'render:3', 3) then
    raise exception 'Trial must allow three exports';
  end if;
  if public.consume_trial_export(a, 'render:1', 3) is distinct from true then raise exception 'Repeated export reference must not count twice'; end if;
  if public.consume_trial_export(a, 'render:4', 3) is distinct from false then raise exception 'Fourth trial export must be refused'; end if;
  if (pg_temp.profile(a)).trial_exports_used <> 3 then raise exception 'Trial export counter is wrong'; end if;
end;
$$;

-- Abo: Start, Wechsel, Monatsgutschrift, Übertrag, Kündigung --------------------
do $$
declare
  a constant uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
  v_start timestamptz := now() - interval '1 day';
begin
  perform public.apply_subscription(a, 'starter', 150, 'active', v_start, v_start + interval '1 month', 'sub_a', 'cus_a');
  if (pg_temp.profile(a)).plan_credits <> 150 or (pg_temp.profile(a)).pack_credits <> 100
     or (pg_temp.profile(a)).subscription_tier <> 'starter' or (pg_temp.profile(a)).monthly_credits <> 150 then
    raise exception 'New subscription must grant one allotment and keep packs';
  end if;
  if public.consume_trial_export(a, 'render:5', 3) is distinct from true then raise exception 'Subscribers export without limit'; end if;

  perform public.apply_subscription(a, 'starter', 150, 'active', v_start, v_start + interval '1 month', 'sub_a', 'cus_a');
  if (pg_temp.profile(a)).plan_credits <> 150 then raise exception 'Redelivered event granted twice'; end if;

  perform public.apply_subscription(a, 'pro', 450, 'active', v_start, v_start + interval '1 month', 'sub_a', 'cus_a');
  if (pg_temp.profile(a)).plan_credits <> 450 then raise exception 'Upgrade must add the difference'; end if;
  perform public.apply_subscription(a, 'starter', 150, 'active', v_start, v_start + interval '1 month', 'sub_a', 'cus_a');
  if (pg_temp.profile(a)).plan_credits <> 450 or (pg_temp.profile(a)).monthly_credits <> 150 then
    raise exception 'Downgrade must only change future allotments';
  end if;
  perform public.apply_subscription(a, 'pro', 450, 'active', v_start, v_start + interval '1 month', 'sub_a', 'cus_a');
  if (pg_temp.profile(a)).plan_credits <> 450 then raise exception 'Switching back and forth granted extra credits'; end if;

  -- Monatsabo: Der nächste Monat wartet auf die bezahlte Verlängerung.
  update public.profiles set credit_cycle_anchor = now() - interval '35 days',
    current_period_end = now() - interval '35 days' + interval '1 month' where id = a;
  perform public.credit_balance(a);
  if (pg_temp.profile(a)).plan_credits <> 450 then raise exception 'Unpaid month was granted'; end if;

  -- Jahresabo mitten in der Periode: fälliger Monat mit Übertrag.
  update public.profiles set credit_cycle_anchor = now() - interval '40 days',
    current_period_end = now() + interval '300 days' where id = a;
  perform public.credit_balance(a);
  if (pg_temp.profile(a)).plan_credits <> 900 or (pg_temp.profile(a)).credit_cycles_granted <> 2 then
    raise exception 'Due month was not granted: %', (pg_temp.profile(a)).plan_credits;
  end if;
  perform public.credit_balance(a);
  if (pg_temp.profile(a)).plan_credits <> 900 then raise exception 'Month granted twice'; end if;

  -- Übertrag höchstens ein Monatskontingent: 700 Rest → 450 + 450.
  update public.profiles set plan_credits = 700, credit_cycle_anchor = now() - interval '70 days' where id = a;
  if (select plan_credits from public.credit_balance(a)) <> 900 then raise exception 'Rollover must be capped at one allotment'; end if;

  -- Zahlungsverzug pausiert Gutschriften, der Tarif bleibt.
  perform public.apply_subscription(a, 'pro', 450, 'past_due', v_start, now() + interval '300 days', 'sub_a', 'cus_a');
  update public.profiles set credit_cycle_anchor = now() - interval '100 days' where id = a;
  perform public.credit_balance(a);
  if (pg_temp.profile(a)).plan_credits <> 900 or (pg_temp.profile(a)).subscription_tier <> 'pro' then
    raise exception 'past_due must pause grants without downgrading';
  end if;

  -- Das Ende eines fremden Abos ändert nichts, das eigene führt zu Free.
  perform public.apply_subscription(a, 'free', 0, 'canceled', v_start, now(), 'sub_other', 'cus_a');
  if (pg_temp.profile(a)).subscription_tier <> 'pro' then raise exception 'Foreign subscription changed the plan'; end if;
  perform public.apply_subscription(a, 'free', 0, 'canceled', v_start, now(), 'sub_a', 'cus_a');
  if (pg_temp.profile(a)).subscription_tier <> 'free' or (pg_temp.profile(a)).monthly_credits <> 0
     or (pg_temp.profile(a)).stripe_subscription_id is not null
     or (pg_temp.profile(a)).plan_credits <> 900 or (pg_temp.profile(a)).pack_credits <> 100 then
    raise exception 'Cancellation must return to free and keep granted credits';
  end if;
  if public.consume_trial_export(a, 'render:6', 3) is distinct from true then raise exception 'Former subscribers keep exporting'; end if;
  if (select on_trial from public.credit_balance(a)) is distinct from false then raise exception 'Former subscriber is not on trial'; end if;
end;
$$;

-- Rechte ----------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-1111-1111-1111-111111111111';
do $$
declare a constant uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
begin
  if (select count(*) from public.profiles where id in (a, 'bbbbbbbb-2222-2222-2222-222222222222')) <> 1 then
    raise exception 'Profile read isolation failed';
  end if;
  update public.profiles set full_name = 'Editable name' where id = a;
  if not found then raise exception 'Own display name was not editable'; end if;
  begin
    update public.profiles set plan_credits = 100000;
    raise exception 'Client increased own plan credits';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set pack_credits = 100000;
    raise exception 'Client increased own pack credits';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set trial_exports_used = 0;
    raise exception 'Client reset own export counter';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set monthly_credits = 1200;
    raise exception 'Client changed own allotment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.charge_clip_tokens(a, 1, 'client:charge');
    raise exception 'Client called service-only charge RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.grant_token_pack(a, 60, 'client:pack');
    raise exception 'Client called service-only pack RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.apply_subscription(a, 'agency', 1200, 'active', now(), now() + interval '1 month', 'sub_fake', null);
    raise exception 'Client called service-only subscription RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consume_trial_export(a, 'client:export', 1000);
    raise exception 'Client called service-only export RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.credit_balance(a);
    raise exception 'Client called service-only balance RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.clip_token_charges;
    raise exception 'Client accessed private charge ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.export_events;
    raise exception 'Client accessed private export ledger';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set role service_role;
do $$
begin
  if public.charge_clip_tokens('bbbbbbbb-2222-2222-2222-222222222222', 1, 'clip:service-role') is distinct from true then
    raise exception 'Service role cannot debit credits';
  end if;
  perform public.credit_balance('bbbbbbbb-2222-2222-2222-222222222222');
end;
$$;
reset role;

select 'Credit assertions passed.';
