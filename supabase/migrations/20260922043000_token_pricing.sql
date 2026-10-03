-- Free-Tier-Default: 8 Token/Monat (vorher 10), abgestimmt auf plans.ts.
alter table public.profiles
  alter column render_minutes_limit set default 8;
