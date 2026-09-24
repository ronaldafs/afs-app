# AFS Operatie Schiphol — dashboard op Supabase

Eén app voor medewerkers (onboarding), scans, dienstrapport, incidenten en rapportage, met inloggen per gebruiker.

## Bestanden
- `index.html` + `style.css` + `app.js` — de app
- `scan-core.js` — routemodel en EcoSmart-parser (uit het Scan Route Dashboard)
- `scan.html` — het uitgebreide scan-dashboard (ongewijzigd, opent vanuit Scans)
- `config.js` — hier komen je Supabase-URL en anon key
- `schema.sql` — tabellen en beveiliging voor Supabase

## Installatie (±20 minuten)
1. **Supabase-project**: ga naar supabase.com → New project (regio EU, kies een sterk database-wachtwoord).
2. **Tabellen**: SQL Editor → New query → plak de inhoud van `schema.sql` → Run.
3. **Inloggen aanzetten**: Authentication → Providers → Email: aan. Zet "Confirm email" uit (Authentication → Settings) zodat je zelf gebruikers kunt aanmaken zonder mail.
4. **Gebruikers aanmaken**: Authentication → Users → Add user → e-mail + wachtwoord. Doe dit voor jezelf, Sonny en elke voorman.
5. **Rollen**: Table Editor → `profiles` → per gebruiker `naam` invullen en `rol` op `kantoor` (jij, Sonny) of `voorman`.
6. **Sleutels**: Project Settings → API → kopieer *Project URL* en *anon public* key naar `config.js`.
7. **Online zetten**: sleep de hele map naar https://app.netlify.com/drop (gratis). Je krijgt een link zoals `https://afs-schiphol.netlify.app`; die deel je met het team. (Alternatief: GitHub Pages of Vercel.)

## Gebruik
- **Scans** → "EcoSmart-export inlezen" (xlsx of csv). De app koppelt elke scan aan een route en winkel en laat per route zien welke winkels niet zijn gescand.
- **Dienstrapporten aanmaken voor deze dag** → maakt per route/dienst een rapport met doel, gehaald en de gemiste winkels, status *Te bevestigen*. De voorman vult alleen nog de medewerker en de reden in en klikt op *bevestigen*.
- Alles wat een voorman invult wordt automatisch op zijn naam gezet (uit `profiles`).
- Kantoor vult bij een dienstrapport de *Kantoorcontrole* in; de voorman ziet dat als aanspreekpunt.

## Bestaande gegevens overzetten
Exporteer in het oude dashboard (Exporteren → Excel) en importeer de medewerkers via **Medewerkers → Importeren**. Incidenten en dienstrapporten kun je via Supabase → Table Editor → Import CSV inladen (kolomnamen zijn gelijk).

## Mail (dagrapport en directe meldingen)
1. Maak een gratis account op resend.com, voeg je domein toe (DNS-records) of gebruik voor een test het adres `onboarding@resend.dev`. Kopieer de API key.
2. Supabase → Edge Functions → Deploy new function → naam `send-mail` → plak `supabase/functions/send-mail/index.ts`. (Of via de CLI: `supabase functions deploy send-mail`.)
3. Edge Functions → Secrets: `RESEND_API_KEY`, `MAIL_FROM` (bijv. `AFS Operatie Schiphol <operatie@jouwdomein.nl>`).
4. SQL Editor → plak `supabase/mail.sql` (vul project-URL en anon key in) → Run. Dit maakt de ontvangerstabel en de dagelijkse cron om 07:00.
5. Directe meldingen: Database → Webhooks → Create → tabel `dienstrapport`, events Insert + Update, type Supabase Edge Function → `send-mail`.
6. In de app: Rapportage → **Mail** → ontvangers toevoegen en per persoon kiezen: dagrapport, onder norm, aanspreekpunt. Met **Stuur dagrapport nu** test je het.
