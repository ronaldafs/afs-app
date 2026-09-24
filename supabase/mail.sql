-- Mail: ontvangers + automatisch versturen. Uitvoeren in de SQL Editor NA schema.sql.

create table if not exists mail_ontvangers (
  email text primary key,
  naam text,
  dagrapport boolean default true,      -- elke ochtend het dagrapport van gisteren
  onder_norm boolean default false,     -- direct bij een bevestigd rapport onder de norm
  aanspreekpunt boolean default false,  -- direct bij een nieuw kantoor-aanspreekpunt
  actief boolean default true
);
alter table mail_ontvangers enable row level security;
drop policy if exists "auth all" on mail_ontvangers;
create policy "auth all" on mail_ontvangers for all to authenticated using (true) with check (true);

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
