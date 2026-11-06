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
    number: '05',
    // Starttijd van de eerste heat, bijvoorbeeld '2027-03-13T08:00:00+01:00'.
    // Laat op null staan zolang de datum niet vaststaat; dan toont de site "datum volgt".
    start: null,
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
