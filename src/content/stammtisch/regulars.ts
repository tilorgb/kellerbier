import type { RegularDefinition } from '../../app/meta/definition.js';

/**
 * Der Stammtisch — the regulars' table (#46), as data.
 *
 * Four chairs today: two earned off the two bosses that exist, two off
 * totals a player accumulates across runs. The table is deliberately not
 * seven chairs deep for seven floors — floors 3-7 are parked (M10), and a
 * table showing five permanently empty chairs would be promising a game the
 * itch.io release (M9) is not. Adding the chair for a floor is a row here on
 * the day that floor's boss lands.
 *
 * ## Why the lines are conditioned rather than random
 *
 * Every line except the catch-all is authored under a predicate over the
 * *last run* (`app/meta/definition.ts`'s `LineCondition`) and may quote it
 * back with `{sek}`, `{kills}`, `{stock}` and `{wort}`. That is #46's
 * acceptance criterion — the comments reference the actual last run, not
 * generic text — and it is also the cheapest way to make four regulars feel
 * like they were watching: a line that knows you died in the cellar after
 * eleven seconds reads as a person, and one that says "bad luck" reads as a
 * string table.
 */
export const STAMMTISCH_REGULARS: readonly RegularDefinition[] = [
  {
    id: 'sepp',
    name: 'Da Sepp',
    role: 'Kellermeister a. D., wohnt nebndran',
    seat: 1,
    grants: 'lore-opas-zettl',
    greeting:
      'Servus. I bin da Sepp, vom Keller nebndran. Dei Opa hot ma an Zettl dolassn — den les i dir vor.',
    lines: [
      { when: { kind: 'shorterThan', seconds: 20 }, text: '{sek}. Da war ja d’Tür no ned zua.' },
      {
        when: { kind: 'killsBelow', kills: 5 },
        text: '{kills} Viecher. Da hast di ehrlich zruckghaltn.',
      },
      {
        when: { kind: 'reachedFloor', floor: 2 },
        text: 'Bis auffi aufn Acker kemma. Dei Opa hot gsagt, des schaffst nie.',
      },
      {
        when: { kind: 'diedOnFloor', floor: 1 },
        text: 'Im Keller umgfalln, nach {sek}. Der Keller is a zacher Hund, gell.',
      },
      {
        when: { kind: 'always' },
        text: 'Am Zettl steht: „Trink ned dei eigene Ware.“ Mehr steht ned drauf.',
      },
    ],
    waiting: 'A leara Stui. Der ghört dem, der unt im Keller aufgräumt hot.',
  },
  {
    id: 'xaver',
    name: 'Da Xaver',
    role: 'Wirt in Oberniederburg',
    seat: 2,
    grants: 'promille',
    greeting:
      'I bin da Xaver, mir ghört d’Wirtschaft. Den Stier host gnua gärgert — drum steht ab jetzt a Maß am Tisch.',
    lines: [
      {
        when: { kind: 'diedOnFloor', floor: 1 },
        text: 'Im Keller? Nach dem wost scho unt gwen bist? Geh zua.',
      },
      {
        when: { kind: 'killsAtLeast', kills: 100 },
        text: '{kills} Stück. I schenk da nach, des host da gschafft.',
      },
      {
        when: { kind: 'longerThan', seconds: 300 },
        text: '{sek} am Stück. Bei mir hättst so lang ned dagsessn.',
      },
      {
        when: { kind: 'reachedFloor', floor: 2 },
        text: '{stock}, {sek}. Der Stier hot a Gedächtnis, den ärgerst ned zwoamal gleich.',
      },
      { when: { kind: 'always' }, text: '„{wort}“, hams gsagt. Setz di her, i hör ma’s o.' },
    ],
    waiting: 'Do ghört der her, der ’s Bier bringt. Der kimmt ned umsonst.',
  },
  {
    id: 'traudl',
    name: "D'Traudl",
    role: 'Bedienung, merkt si ois',
    seat: 3,
    grants: 'stammtisch-tafel',
    greeting: 'Traudl. I schreib ois o, was du treibst — des steht ab jetzt an der Tafel.',
    lines: [
      { when: { kind: 'killsBelow', kills: 10 }, text: '{kills}. Des pass i ned amal an d’Tafel.' },
      { when: { kind: 'killsAtLeast', kills: 50 }, text: '{kills} — des schreib i groß o.' },
      { when: { kind: 'shorterThan', seconds: 30 }, text: '{sek}. Kaum higsetzt, scho wieder do.' },
      { when: { kind: 'always' }, text: '{stock}, {sek}. Steht an der Tafel.' },
    ],
    waiting: 'Do sitzt kane, solang koaner mitschreibt.',
  },
  {
    id: 'toni',
    name: 'Da Toni',
    role: 'Der wo immer scho do war',
    seat: 4,
    grants: 'stammtisch-zufoi',
    greeting:
      'Toni. I merk ma d’Zoin. Sag ma an Samen, und der Lauf schaut wieder genau so aus wie er war.',
    lines: [
      { when: { kind: 'longerThan', seconds: 180 }, text: '{sek}. Den Samen schreib i ma auf.' },
      {
        when: { kind: 'diedOnFloor', floor: 1 },
        text: 'Wieder im Keller. Nimm den gleichen Samen no amal, jetzt woaßt ja wo’s steht.',
      },
      { when: { kind: 'always' }, text: '{stock}, {sek}. Der Same davo liegt no am Tisch.' },
    ],
    waiting: 'Der Platz ghört dem, der d’Zoin kennt. A paar Läufe braucht’s no.',
  },
];
