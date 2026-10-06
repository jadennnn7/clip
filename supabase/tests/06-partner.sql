\set ON_ERROR_STOP on

-- Partnerprogramm: Code, Zuordnung, Provisionen, Erstattungen, Auszahlungen.
-- Läuft über schema.sql und über den Migrationspfad.

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-00000000000a', 'partner@example.com'),
  ('b1000000-0000-0000-0000-00000000000b', 'customer@example.com'),
  ('c1000000-0000-0000-0000-00000000000c', 'subscriber@example.com');

-- Partnercode ------------------------------------------------------------------
do $$
declare
  a constant uuid := 'a1000000-0000-0000-0000-00000000000a';
  v_code text;
begin
  v_code := public.ensure_partner_code(a);
  if v_code !~ '^[abcdefghjkmnpqrstuvwxyz23456789]{8}$' then raise exception 'Unexpected partner code %', v_code; end if;
  if public.ensure_partner_code(a) <> v_code then raise exception 'Partner code must stay the same'; end if;
  perform set_config('test.partner_code', v_code, false);
  -- Ein Konto, das schon ein Abo hatte, bringt keine Provision.
  update public.profiles set trial_ended_at = now() where id = 'c1000000-0000-0000-0000-00000000000c';
end;
$$;
select '  Partnercode: ok';

-- Zuordnung durch den angemeldeten Nutzer --------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
do $$
begin
  if public.claim_referral(current_setting('test.partner_code')) then raise exception 'Self-referral accepted'; end if;
end;
$$;
set request.jwt.claim.sub = 'c1000000-0000-0000-0000-00000000000c';
do $$
begin
  if public.claim_referral(current_setting('test.partner_code')) then raise exception 'Former subscriber was referred'; end if;
end;
$$;
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-00000000000b';
do $$
begin
  if public.claim_referral('unknown1') then raise exception 'Unknown code accepted'; end if;
  if public.claim_referral('../x') then raise exception 'Invalid code accepted'; end if;
  if not public.claim_referral(upper(current_setting('test.partner_code'))) then raise exception 'Valid referral rejected'; end if;
  if public.claim_referral(current_setting('test.partner_code')) then raise exception 'Referral must be claimed once'; end if;
  if (select referred_by from public.profiles where id = 'b1000000-0000-0000-0000-00000000000b')
     is distinct from 'a1000000-0000-0000-0000-00000000000a' then
    raise exception 'Referral not stored';
  end if;
end;
$$;
do $$
begin
  begin
    perform public.record_partner_commission('b1000000-0000-0000-0000-00000000000b', 'in_x', null, 100, 'eur', now(), 0.2, 12, 30);
    raise exception 'authenticated may not book commissions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.partner_overview('a1000000-0000-0000-0000-00000000000a');
    raise exception 'authenticated may not read partner balances';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
set role anon;
do $$
begin
  begin
    perform public.claim_referral('abcdefgh');
    raise exception 'anon may not claim referrals';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select '  Zuordnung: ok';

-- Provisionen ------------------------------------------------------------------
do $$
declare
  b constant uuid := 'b1000000-0000-0000-0000-00000000000b';
  c constant uuid := 'c1000000-0000-0000-0000-00000000000c';
  v_first constant timestamptz := now() - interval '40 days';
begin
  if public.record_partner_commission(b, 'in_1', 'pi_1', 3277, 'EUR', v_first, 0.2, 12, 30) <> 655 then
    raise exception 'Commission must be 20 %% of net, rounded down';
  end if;
  if public.record_partner_commission(b, 'in_1', 'pi_1', 9999, 'eur', v_first, 0.2, 12, 30) <> 655 then
    raise exception 'Redelivered event must return the booked commission';
  end if;
  if (select count(*) from public.partner_commissions where reference = 'in_1') <> 1 then
    raise exception 'Redelivered event duplicated the commission';
  end if;
  if public.record_partner_commission(c, 'in_c', 'pi_c', 3277, 'eur', now(), 0.2, 12, 30) is not null then
    raise exception 'Account without partner earned a commission';
  end if;
  perform public.record_partner_commission(b, 'in_2', 'pi_2', 3277, 'eur', now() - interval '35 days', 0.2, 12, 30);
  perform public.record_partner_commission(b, 'in_3', 'pi_3', 3277, 'eur', now() - interval '5 days', 0.2, 12, 30);
  if public.record_partner_commission(b, 'in_late', 'pi_late', 3277, 'eur', v_first + interval '12 months', 0.2, 12, 30) is not null then
    raise exception 'Commission paid after the 12-month window';
  end if;
  if public.record_partner_commission(b, 'in_edge', 'pi_edge', 3277, 'eur', v_first + interval '12 months' - interval '1 second', 0.2, 12, 30) is null then
    raise exception 'Last payment inside the window was not credited';
  end if;
  delete from public.partner_commissions where reference = 'in_edge';

  begin
    perform public.record_partner_commission(b, 'in_bad', null, 0, 'eur', now(), 0.2, 12, 30);
    raise exception 'Zero net amount accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.record_partner_commission(b, 'in_bad', null, 100, 'eur', now(), 1.5, 12, 30);
    raise exception 'Rate above 100 %% accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;
select '  Provisionen: ok';

-- Erstattungen -----------------------------------------------------------------
do $$
begin
  if public.reverse_partner_commission('pi_2', 1950, 3900) <> 1 then raise exception 'Refund did not find the commission'; end if;
  if (select reversed_cents from public.partner_commissions where reference = 'in_2') <> 328 then
    raise exception 'Half refund must reverse half the commission, rounded up';
  end if;
  perform public.reverse_partner_commission('pi_2', 100, 3900);
  if (select reversed_cents from public.partner_commissions where reference = 'in_2') <> 328 then
    raise exception 'Out-of-order refund event reduced the reversal';
  end if;
  if public.reverse_partner_commission('pi_unknown', 100, 100) <> 0 then raise exception 'Unknown payment matched'; end if;
end;
$$;
select '  Erstattungen: ok';

-- Stand und Auszahlung ---------------------------------------------------------
do $$
declare
  a constant uuid := 'a1000000-0000-0000-0000-00000000000a';
  o record;
begin
  select * into o from public.partner_overview(a);
  if o.partner_code <> current_setting('test.partner_code') or o.signups <> 1 or o.customers <> 1
     or o.pending_cents <> 655 or o.available_cents <> 655 + 327 or o.paid_out_cents <> 0
     or o.next_release_at is null then
    raise exception 'Unexpected overview %', row_to_json(o);
  end if;

  if exists (select 1 from public.partner_payables(5000)) then raise exception 'Balance below the minimum listed'; end if;
  if (select available_cents from public.partner_payables(500) where user_id = a) <> 982 then
    raise exception 'Payable balance missing';
  end if;

  begin
    perform public.record_partner_payout(a, 983, 'Überweisung');
    raise exception 'Payout above the balance accepted';
  exception when sqlstate '22023' then null;
  end;
  perform public.record_partner_payout(a, 982, 'Überweisung Oktober');
  select * into o from public.partner_overview(a);
  if o.available_cents <> 0 or o.paid_out_cents <> 982 then raise exception 'Payout not booked %', row_to_json(o); end if;

  -- Rückbuchung nach der Auszahlung: verrechnet sich mit der nächsten.
  perform public.reverse_partner_commission('pi_1', 1, 1);
  select * into o from public.partner_overview(a);
  if o.available_cents <> -655 then raise exception 'Clawback after payout lost %', row_to_json(o); end if;
  if exists (select 1 from public.partner_payables(1) where user_id = a) then raise exception 'Negative balance listed as payable'; end if;
end;
$$;
select '  Stand und Auszahlung: ok';

-- Geworbenes Konto gelöscht: Provisionen bleiben -------------------------------
do $$
begin
  delete from auth.users where id = 'b1000000-0000-0000-0000-00000000000b';
  if (select count(*) from public.partner_commissions where user_id = 'a1000000-0000-0000-0000-00000000000a') <> 3
     or exists (select 1 from public.partner_commissions where customer_id is not null) then
    raise exception 'Deleting the customer must keep the commissions without the customer';
  end if;
end;
$$;
select '  Löschung des geworbenen Kontos: ok';
