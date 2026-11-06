# Hyrox Sim Roelofarendsveen: website

De site van de Hyrox-simulatie van Club Confidence en By Opdam. Bezoekers zien de leaderboards per editie en voor de officiële Hyrox-events. Deelnemers loggen in met een code van zes cijfers die ze per mail krijgen, en houden daarna zelf hun tijden bij.

De site bestaat uit gewone bestanden (HTML, CSS en JavaScript) zonder build-stap. Database en inloggen draaien bij Supabase.

## Mappen

| Pad | Wat |
| --- | --- |
| `index.html` | De pagina |
| `assets/config.js` | **Het enige bestand dat je normaal aanpast**: datum, inschrijflink, programma |
| `assets/app.js` | Leaderboard, inloggen en Mijn tijden |
| `assets/styles.css` | Vormgeving (Club Confidence: zwart, wit, roze `#EB4967`) |
| `img/` | Foto's |
| `supabase/migrations/` | De database precies zoals hij in Supabase staat, in volgorde toegepast |
| `supabase/tests/security_test.sql` | Optionele beveiligingstest om in de SQL Editor te draaien |
| `tests/` | Browsertest met een nep-Supabase (zie onderaan) |

## Instellingen in `assets/config.js`

- `nextEdition.start`: starttijd van de volgende editie, bijvoorbeeld `'2027-03-13T08:00:00+01:00'`. Met `null` toont de site "datum volgt" en geen aftelklok.
- `signupUrl`: link naar het inschrijfformulier. Met `null` geven de inschrijfknoppen een melding dat de inschrijving binnenkort opent.
- `programme`: het tijdschema. Een lege lijst (`[]`) toont "programma volgt".
- `codeLength` (optioneel, standaard 6): moet gelijk zijn aan "Email OTP Length" in Supabase.

## Supabase

- Project `hyrox-sim-roelofarendsveen` (ref `ocdnerhyssvkjhdgstvp`), regio Frankfurt, gratis plan.
- De publishable key in `config.js` mag openbaar zijn. Wat bezoekers mogen lezen en schrijven wordt in de database afgedwongen met row level security.

### Tabellen

- `events`: edities van de sim (`sim-01` t/m `sim-04`) en officiële events (`off-utrecht`, `off-amsterdam`). `accepts_entries = false` sluit een event voor nieuwe tijden.
- `profiles`: naam en club per ingelogde deelnemer. E-mailadressen staan hier niet in en zijn nooit openbaar.
- `results`: tijden. Categorieën `single_men`, `single_women`, `doubles_mixed`, `doubles_men`, `doubles_women`, `relay`. Divisie `open` of `pro`. Status `self_reported`, `verified` of `rejected`.
- `admins`: e-mailadressen van organisatoren. Niet via de site te lezen.
- View `leaderboard`: tijden met naam en club, zonder afgekeurde tijden.

### Regels

- Iedereen kan leaderboards lezen. Afgekeurde tijden zijn alleen zichtbaar voor de eigenaar.
- Een deelnemer kan alleen eigen tijden toevoegen, aanpassen en verwijderen, en één tijd per event per categorie hebben.
- Een deelnemer kan een tijd nooit zelf op "geverifieerd" zetten. Past iemand een geverifieerde tijd aan, dan gaat de status terug naar "zelf ingevoerd".
- Wat je in het Supabase-dashboard doet (Table Editor, SQL Editor) valt buiten deze beperkingen. Zo kun je tijden goedkeuren en oude uitslagen importeren.

## Eenmalig instellen voor de livegang

1. **Inlogmail met code.** Authentication, Emails, Templates. Pas zowel **Magic Link** als **Confirm signup** aan. Nieuwe deelnemers krijgen de tweede, terugkerende de eerste.
   - Onderwerp: `Je inlogcode voor Hyrox Sim Roelofarendsveen`
   - Inhoud:
     ```html
     <h2>Je inlogcode</h2>
     <p>Vul deze code in op de site om je tijden bij te werken:</p>
     <p style="font-size:32px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
     <p>De code is een uur geldig. Heb je niets aangevraagd? Dan kun je deze mail negeren.</p>
     <p>Hyrox Sim Roelofarendsveen · Club Confidence × By Opdam</p>
     ```
2. **Adres van de site.** Authentication, URL Configuration, Site URL: het webadres waar de site komt te staan.
3. **Eigen mailverzending.** De ingebouwde mail van Supabase stuurt alleen naar leden van het Supabase-team en maar een paar mails per uur. Voor echte deelnemers: Authentication, Emails, SMTP Settings, met een dienst als Brevo of Resend en een afzender op een eigen domein (daar horen een paar DNS-records bij).
4. **Ruimere limiet.** Authentication, Rate Limits: zet het aantal mails per uur na stap 3 hoger, bijvoorbeeld 100.
5. **Optioneel**: plak `supabase/tests/security_test.sql` in de SQL Editor en klik Run. De uitkomst staat in de melding `TEST SUMMARY`.

## Beheer

- **Nieuwe editie**: Table Editor, `events`, Insert row: `id` `sim-05`, `kind` `sim`, `name` `Editie 05`, `location` `HAL60, Roelofarendsveen`, `sort_order` `5`. Doe dit pas als de editie geweest is, want dan kunnen deelnemers hun tijd invullen.
- **Nieuw officieel event**: bijvoorbeeld `id` `off-rotterdam`, `kind` `official`, `name` `Hyrox Rotterdam`, `sort_order` `103`.
- **Tijd goed- of afkeuren**: Table Editor, `results`, kolom `status` op `verified` of `rejected`.
- **Oude uitslagen importeren**: Table Editor, `results`, Insert, Import data from CSV, met de kolommen `athlete_name`, `athlete_club`, `event_id`, `category`, `total_seconds` en bij dubbels `partner_name` (bij relay ook `team_name` en `teammates`). Geïmporteerde tijden horen bij niemand; laat deelnemers die tijden dan niet zelf nog eens invoeren, anders staan ze er twee keer in.

## Hosting

De site staat op GitHub Pages: elke wijziging op de branch `main` staat binnen een minuut online. Het eigen domein staat in het bestand `CNAME`; de DNS-records daarvoor staan bij de registrar van het domein.

Een gratis Supabase-project wordt gepauzeerd na een week zonder verkeer. Daarom vraagt `.github/workflows/supabase-wakker-houden.yml` twee keer per week de lijst met events op. GitHub zet zulke geplande taken in een openbare repo zelf uit na 60 dagen zonder wijzigingen; zet hem dan weer aan onder Actions, of herstel een gepauzeerd project met Restore project in het Supabase-dashboard.

## Testen

`tests/e2e.js` test de hele site in Chromium tegen `tests/fake-supabase.js`, een nep-Supabase met voorbeelddata. Inlogcode in de test: `424242`.

```bash
cd tests && npm install
cd .. && python3 -m http.server 8765 &
cd tests && node e2e.js http://127.0.0.1:8765/
```
