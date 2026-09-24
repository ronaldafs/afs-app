-- AFS Operatie Schiphol — Supabase schema
-- Uitvoeren in Supabase → SQL Editor → New query → Run.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  naam text,
  rol text default 'voorman' check (rol in ('kantoor','voorman')),
  created_at timestamptz default now()
);

create table if not exists medewerkers (
  naam text primary key, start text, voorman text, niveau text, actief text default 'ja', onboarding text, updated_at timestamptz default now());
create table if not exists evaluaties (
  naam text, moment text, datum text, uitkomst text, afspraak text, voorman text, updated_at timestamptz default now(), primary key (naam, moment));
create table if not exists routes (
  naam text, route text, niveau text, datum text, voorman text, updated_at timestamptz default now(), primary key (naam, route));
create table if not exists vca (
  naam text primary key, status text, datum text, diploma text, updated_at timestamptz default now());
create table if not exists toolboxen (
  naam text, toolbox text, deadline text, afgerond text, updated_at timestamptz default now(), primary key (naam, toolbox));
create table if not exists incidenten (
  id bigint generated always as identity primary key, datum text, dienst text, naam text, incident text, tijd text, waarschuwing text, voorman text, opmerking text, created_at timestamptz default now());
create table if not exists dienstrapport (
  datum text, dienst text, route text, medewerker text, doel text, gehaald text, gemist text, reden text, opmerking text, voorman text,
  kantoor text, actie text, wie text, status text, gecontroleerd_door text, gecontroleerd_op text, afgerond_door text, afgerond_op text,
  updated_at timestamptz default now(), primary key (datum, dienst, route));
create table if not exists doelen (
  route text primary key, ochtend text, middag text, nacht text);
create table if not exists scans (
  ts timestamptz not null, shop text not null, pin text not null, note text, op_date text, dienst text, primary key (ts, shop, pin));
create index if not exists scans_op_date on scans (op_date);

-- Automatisch een profiel aanmaken bij een nieuwe gebruiker (naam = deel voor de @, rol = voorman; pas aan in de tabel profiles)
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, naam, rol) values (new.id, split_part(new.email, '@', 1), 'voorman') on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Beveiliging: alleen ingelogde gebruikers mogen lezen en schrijven
do $$ declare t text; begin
  for t in select unnest(array['profiles','medewerkers','evaluaties','routes','vca','toolboxen','incidenten','dienstrapport','doelen','scans']) loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth all" on %I', t);
    execute format('create policy "auth all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
