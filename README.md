# Hyrox Sim Roelofarendsveen: website

De site van de Hyrox-simulatie van Club Confidence en By Opdam. Bezoekers zien de leaderboards per editie en voor de officiële Hyrox-events. Deelnemers loggen in met een code van zes cijfers die ze per mail krijgen, en houden daarna zelf hun tijden bij.

Edities met officiële tijdwaarneming in RaceClocker (editie 01, 02 en 03) staan er met de uitslag uit RaceClocker, inclusief alle rondetijden. Op de racedag is die uitslag live te volgen. Zelf een tijd invullen kan alleen voor een editie zonder RaceClocker; zolang die er niet is, is het invulformulier alleen voor officiële Hyrox-races.

Bovenaan de keuzelijst met edities staat **All-time**: alle edities samen, per categorie, met per deelnemer (of duo of team) de beste tijd en de editie waarin die is gelopen. Edities met RaceClocker tellen met de officiële tijd, de andere met de zelf ingevoerde tijden. Deelnemers worden op naam herkend; een duo telt als hetzelfde duo in welke volgorde de namen ook staan.

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
| `supabase/functions/raceclocker/` | Edge function die de uitslag uit RaceClocker ophaalt (zie RaceClocker hieronder) |
| `supabase/tests/security_test.sql` | Optionele beveiligingstest om in de SQL Editor te draaien |
| `tests/` | Browsertest met een nep-Supabase (zie onderaan) |

## Instellingen in `assets/config.js`

- `nextEdition`: de komende editie (nu editie 04 op zondag 14 maart 2027).
  - `number`: het nummer op de site, bijvoorbeeld `'04'`.
  - `eventId`: de id van deze editie in de tabel `events`, bijvoorbeeld `'sim-04'`. Tot de start staat deze editie niet op het leaderboard en niet in het invulformulier, zodat niemand vooraf een tijd kan invullen. Vanaf de start verschijnt hij vanzelf.
  - `start`: alleen de datum (`'2027-03-14'`, de site toont dan "nog 128 dagen") of de datum met de starttijd van de eerste heat (`'2027-03-14T08:00:00+01:00'`, dan komt er een aftelklok tot op de seconde). Met `null` toont de site "datum volgt".
- `signupUrl`: link naar het inschrijfformulier. Met `null` geven de inschrijfknoppen een melding dat de inschrijving binnenkort opent.
- `programme`: het tijdschema. Een lege lijst (`[]`) toont "programma volgt".
- `raceclocker`: per editie de code van de race in RaceClocker, nu `{ 'sim-01': '1fd4d9', 'sim-02': '0839eb85', 'sim-03': 'f4b23f3b' }` voor raceclocker.com/1fd4d9, raceclocker.com/0839eb85 en raceclocker.com/f4b23f3b. Een code is niet altijd 8 tekens. Nieuwe edities hoeven hier niet bij: die koppel je in de tabel `events`, zie RaceClocker hieronder.
- `codeLength` (optioneel, standaard 6): moet gelijk zijn aan "Email OTP Length" in Supabase.

## Supabase

- Project `hyrox-sim-roelofarendsveen` (ref `ocdnerhyssvkjhdgstvp`), regio Frankfurt, gratis plan.
- De publishable key in `config.js` mag openbaar zijn. Wat bezoekers mogen lezen en schrijven wordt in de database afgedwongen met row level security.

### Tabellen

- `events`: edities van de sim (`sim-01` t/m `sim-03` zijn gelopen, `sim-04` is op 14 maart 2027) en officiële events (`off-utrecht`, `off-amsterdam`). `accepts_entries = false` sluit een event voor nieuwe tijden.
- `profiles`: naam en club per ingelogde deelnemer. E-mailadressen staan hier niet in en zijn nooit openbaar.
- `results`: tijden. Categorieën `single_men`, `single_women`, `doubles_mixed`, `doubles_men`, `doubles_women`, `relay`. Divisie `open` of `pro`. Status `self_reported`, `verified` of `rejected`.
- `admins`: e-mailadressen van organisatoren. Niet via de site te lezen.
- `raceclocker_cache`: de laatst opgehaalde uitslag per RaceClocker-race, al omgezet naar het formaat van de site. Alleen de edge function schrijft hierin; iedereen mag lezen. Het is ook het archief als RaceClocker een race ooit niet meer toont.
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
2. **Adres van de site.** Authentication, URL Configuration, Site URL: het webadres waar de site komt te staan. De site geeft bij elke inlogmail zijn eigen adres mee, zodat een link in de mail altijd op de site uitkomt. Supabase accepteert dat adres alleen als het op hetzelfde domein staat als de Site URL. Verhuist de site naar een eigen domein, pas dan meteen ook de Site URL aan.
3. **Eigen mailverzending.** De ingebouwde mail van Supabase stuurt alleen naar leden van het Supabase-team en maar een paar mails per uur. Voor echte deelnemers: Authentication, Emails, SMTP Settings, met een dienst als Brevo of Resend en een afzender op een eigen domein (daar horen een paar DNS-records bij).
4. **Ruimere limiet.** Authentication, Rate Limits: zet het aantal mails per uur na stap 3 hoger, bijvoorbeeld 100.
5. **Optioneel**: plak `supabase/tests/security_test.sql` in de SQL Editor en klik Run. De uitkomst staat in de melding `TEST SUMMARY`.

## Beheer

- **Volgende editie**: voeg hem vooraf toe in Table Editor, `events`, Insert row: `id` `sim-05`, `kind` `sim`, `name` `Editie 05`, `location` `HAL60, Roelofarendsveen`, `sort_order` `5`. Zet daarna in `config.js` bij `nextEdition` het nummer `'05'`, de `eventId` `'sim-05'` en de datum. De site laat de editie pas vanaf de start zien op het leaderboard en in het formulier.
- **Nieuw officieel event**: bijvoorbeeld `id` `off-rotterdam`, `kind` `official`, `name` `Hyrox Rotterdam`, `sort_order` `103`.
- **Tijd goed- of afkeuren**: Table Editor, `results`, kolom `status` op `verified` of `rejected`.
- **Editie koppelen aan RaceClocker**: Table Editor, `events`, bij de editie `raceclocker_id` en `event_date` invullen. Zie RaceClocker hieronder.
- **Oude uitslagen importeren**: Table Editor, `results`, Insert, Import data from CSV, met de kolommen `athlete_name`, `athlete_club`, `event_id`, `category`, `total_seconds` en bij dubbels `partner_name` (bij relay ook `team_name` en `teammates`). Geïmporteerde tijden horen bij niemand; laat deelnemers die tijden dan niet zelf nog eens invoeren, anders staan ze er twee keer in.

## RaceClocker (officiële tijdwaarneming)

RaceClocker deelt de uitslag van een race openbaar als data: `https://raceclocker.com/<code>?JSON=1`. Inloggen is daarvoor niet nodig. Per deelnemer staan daarin ronde 0 (de start) en 16 rondes: run 1, station 1, run 2, ... station 8.

- De edge function `raceclocker` (`supabase/functions/raceclocker/`) haalt die data op, rekent de rondetijden uit en bewaart het resultaat in `raceclocker_cache`. Op de racedag haalt hij hooguit elke 15 seconden een nieuwe versie, op andere dagen hooguit elk uur.
- De site leest eerst de bewaarde versie uit de database en vraagt de function alleen om een nieuwe als die te oud is. Op de racedag ververst de site elke 20 seconden zolang de pagina open staat, met een blok "Nu op het parcours", een lopende klok per deelnemer en nieuwe finishers die oplichten.
- Rondes die niet goed getikt zijn, worden niet verzonnen. Een ronde die niet in de volgorde past, twee tikken binnen 20 seconden (een gemiste tik die is ingehaald) of een ronde die achteraf is verwijderd (een gat in de rondenummers, zoals bij editie 01), maken de losse tijden van die onderdelen onbekend; de site toont dan hun tijd samen. De eindtijd blijft gewoon staan.
- Deelnemers met rondes op een andere dag dan de racedag (een test van de tijdwaarneming), deelnemers die `test` heten en tikken zonder bekende deelnemer (`Unknown` of geen startnummer) laat de function weg. Straftijd telt mee in de eindtijd, met de reden erbij.
- Kids lopen een eigen, korter format: daar staat alleen de eindtijd.
- Wat de function overslaat of vreemd vindt, staat in de bewaarde versie onder `skipped` en `issues`. Bekijk dat in de SQL Editor met `select payload->'skipped', payload->'issues' from raceclocker_cache;`.

**Nieuwe editie koppelen**, bijvoorbeeld editie 04. Daar is geen code voor nodig:

1. Maak de race aan in RaceClocker en noteer de code uit de link (raceclocker.com/**abcd1234**).
2. Open in Supabase de Table Editor, tabel `events`, de rij `sim-04`. Vul bij `raceclocker_id` alleen de code in (`abcd1234`) en bij `event_date` de racedag (`2027-03-14`). Klik Save.

De racedag is de dag waarop de rondes getikt worden: op die dag ververst de uitslag live. Zonder `event_date` werkt het ook, maar dan weet de koppeling pas na de eerste starts welke dag de racedag is. Editie 01 tot en met 03 staan nog in `assets/config.js` en in de function; een code in de tabel gaat altijd voor.

Vanaf dan is editie 04 niet meer zelf in te vullen en toont het leaderboard de RaceClocker-uitslag; op de racedag live. In RaceClocker moet de categorie van een deelnemer in de kolom Gender staan (Single Men, Duo Women, Mixed Duo, Relay, Kids, enzovoort), net als bij editie 03. Is Gender leeg, dan kijkt de function in de kolom Custom naar een code zoals bij editie 01: HS, DS, HD, DD of MD (heren, dames of mixed, single of duo).

## Hosting

De site staat op GitHub Pages: elke wijziging op de branch `main` staat binnen een minuut online. Het eigen domein staat in het bestand `CNAME`; de DNS-records daarvoor staan bij de registrar van het domein.

Een gratis Supabase-project wordt gepauzeerd na een week zonder verkeer. Daarom vraagt `.github/workflows/supabase-wakker-houden.yml` twee keer per week de lijst met events op. GitHub zet zulke geplande taken in een openbare repo zelf uit na 60 dagen zonder wijzigingen; zet hem dan weer aan onder Actions, of herstel een gepauzeerd project met Restore project in het Supabase-dashboard.

## Testen

`tests/e2e.js` test de hele site in Chromium tegen `tests/fake-supabase.js`, een nep-Supabase met voorbeelddata. Inlogcode in de test: `424242`.

`tests/login-real.js` test het inloggen met de echte supabase-js (dezelfde versie als in `index.html`) tegen een nagebootste Supabase-server: de inlogmail verwijst terug naar de site, de link uit de mail logt in en vraagt om je naam, en een verlopen link geeft een nette melding. Ook leest de site daar de bewaarde RaceClocker-uitslag zoals de echte API dat doet.

`tests/raceclocker-normalise.test.mjs` test de omrekening van RaceClocker-data naar de uitslag (rondetijden, gemiste tikken, testrondes, live-status) met verzonnen deelnemers.

```bash
cd tests && npm install
cd .. && python3 -m http.server 8765 &
cd tests && npm test
```
