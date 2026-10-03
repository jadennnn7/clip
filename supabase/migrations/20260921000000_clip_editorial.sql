-- Für bestehende Installationen; neue Datenbanken verwenden schema.sql.
alter table public.clips add column if not exists editorial jsonb;
alter table public.clips add column if not exists analysis_source text
  check (analysis_source in ('ai', 'heuristic'));
alter table public.clips add column if not exists analysis_notice text;

comment on column public.clips.editorial is
  'Versionierte redaktionelle Bewertung von Hook, Flow und Value. Trend ohne aktuelle Datengrundlage unbewertet; NULL bei älteren oder regelbasierten Clips.';
