/*
 * Instellingen voor de Hyrox Sim-site. Dit is het enige bestand dat je hoeft aan te passen
 * voor datum, inschrijflink en programma.
 */
window.HYROX_CONFIG = {
  // Supabase-project "hyrox-sim-roelofarendsveen". De publishable key mag in de browser staan:
  // wat bezoekers mogen lezen en schrijven wordt in de database zelf afgedwongen.
  supabaseUrl: 'https://ocdnerhyssvkjhdgstvp.supabase.co',
  supabaseKey: 'sb_publishable_zvpz2bRE_hWO5J-twb0zMw_nIPEMUgO',

  nextEdition: {
    number: '04',
    // Id van deze editie in de tabel events. De site toont deze editie pas vanaf de start op het
    // leaderboard en in het invulformulier, zodat niemand vooraf een tijd kan invullen.
    eventId: 'sim-04',
    // Datum, eventueel met de starttijd van de eerste heat:
    //   '2027-03-14'                  alleen de datum: "nog 128 dagen"
    //   '2027-03-14T08:00:00+01:00'   met starttijd: aftelklok tot op de seconde
    // null = "datum volgt".
    start: '2027-03-14T08:00:00+01:00',
    location: 'HAL60, Roelofarendsveen'
  },

  // Link naar het inschrijfformulier zodra de inschrijving open is. null = "opent binnenkort".
  signupUrl: null,

  // Voorlopig programma. Pas aan of maak leeg ([]) om "programma volgt" te tonen.
  programme: [
    ['07:30', 'Zaal open, startnummers ophalen'],
    ['08:00', 'Eerste heat, singles'],
    ['Elke 20 min', 'Nieuwe heat met 6 tot 8 deelnemers'],
    ['12:30', 'Heats voor de dubbels'],
    ['14:30', 'Relay-heats, teams van vier'],
    ['15:30', 'Laatste heat'],
    ['16:30', 'Prijsuitreiking per categorie']
  ]
};
