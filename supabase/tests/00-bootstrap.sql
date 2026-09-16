-- Minimale Supabase-Voraussetzungen, damit schema.sql gegen ein nacktes
-- Postgres läuft: die Rollen und die auth.users-Tabelle, auf die es verweist.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- auth.uid() gibt es in Supabase nativ; hier ein Platzhalter gleicher Signatur.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
