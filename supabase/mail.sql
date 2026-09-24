-- Mail: ontvangers + automatisch versturen. Uitvoeren in de SQL Editor NA schema.sql.

create table if not exists mail_ontvangers (
  email text primary key,
  naam text,
  dagrapport boolean default true,      -- elke ochtend het dagrapport van gisteren
  onder_norm boolean default false,     -- direct bij een bevestigd rapport onder de norm
  aanspreekpunt boolean default false,  -- direct bij een nieuw kantoor-aanspreekpunt
  shiftrapport boolean default false,   -- zodra alle routes van een dienst zijn bevestigd (na de avonddienst ook het dagrapport)
  actief boolean default true
);
alter table mail_ontvangers enable row level security;
drop policy if exists "auth all" on mail_ontvangers;
create policy "auth all" on mail_ontvangers for all to authenticated using (true) with check (true);

alter table mail_ontvangers add column if not exists shiftrapport boolean default false;

-- Voorkomt dubbele mails: één shiftrapport per dag/dienst en één dagrapport per dag
create table if not exists mail_log (
  id bigint generated always as identity primary key,
  datum text, dienst text, type text, sent_at timestamptz default now(),
  unique (datum, dienst, type)
);
alter table mail_log enable row level security;
drop policy if exists "auth all" on mail_log;
create policy "auth all" on mail_log for all to authenticated using (true) with check (true);

-- Dagelijks dagrapport om 07:00 (Nederlandse tijd = 05:00 UTC in de zomer, 06:00 UTC in de winter).
-- Vul hieronder je project-URL en de ANON key in (Project Settings → API).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('dagrapport') where exists (select 1 from cron.job where jobname = 'dagrapport');
select cron.schedule('dagrapport', '0 5 * * *', $$
  select net.http_post(
    url := 'https://xwspmpktdbbmxqnqzwjf.supabase.co/functions/v1/send-mail',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_MIvayhtNLNQn64x-3T69ZQ_-Hqwl6FG"}'::jsonb,
    body := '{"type":"dagrapport"}'::jsonb
  );
$$);
