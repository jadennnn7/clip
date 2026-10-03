-- ============================================================================
-- Gratis-Test: 120 statt 30 Credits
-- ============================================================================
-- 30 Minuten reichten für kein übliches Langvideo — wer eine Podcastfolge
-- testen wollte, scheiterte vor dem ersten Clip. Neue Konten starten mit 120
-- Credits (`TRIAL.credits` in src/lib/stripe/plans.ts).
--
-- Konten, die noch im Test sind, bekommen die Differenz dazu, so als hätten
-- sie mit 120 begonnen. Wer ein Abo hat oder hatte, ist nicht mehr im Test
-- und bleibt unberührt.
--
-- Wiederholbar: Gutgeschrieben wird nur, solange der Standardwert der Spalte
-- noch 30 ist.
-- ============================================================================

begin;

do $$
begin
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan_credits')
     is distinct from '30' then
    return;
  end if;

  alter table public.profiles alter column plan_credits set default 120;
  update public.profiles
     set plan_credits = plan_credits + 90, updated_at = now()
   where monthly_credits = 0 and trial_ended_at is null;
end;
$$;

commit;
