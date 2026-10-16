// Aktivitetsstöd: räknar fram det som ska rapporteras till RF via
// IdrottOnline (LOK-stöd) och till kommunen.
//
// Reglerna skiljer sig åt mellan bidragsgivarna, så de ligger som data i
// stället för i koden. Siffrorna här är underlaget – själva inrapporteringen
// görs i respektive portal, och klubben ansvarar för att reglerna stämmer
// med årets anvisningar.
export const REGLER = {
  lok: {
    namn: 'Statligt lokalt aktivitetsstöd (LOK)',
    mottagare: 'Riksidrottsförbundet via IdrottOnline',
    alder_min: 7,
    alder_max: 25,
    min_deltagare: 3,
    min_minuter: 60,
    ledare_kravs: true,
    // En deltagare får räknas en gång per dag och sammankomst.
    en_per_dag: true,
    perioder: [
      { namn: 'Vårterminen', fran: '01-01', till: '06-30', sista_rapportdag: '25 augusti' },
      { namn: 'Hösterminen', fran: '07-01', till: '12-31', sista_rapportdag: '25 februari' },
    ],
  },
  kommun: {
    namn: 'Kommunalt aktivitetsstöd',
    mottagare: 'Härnösands kommun',
    alder_min: 7,
    alder_max: 20,
    min_deltagare: 3,
    min_minuter: 60,
    ledare_kravs: true,
    en_per_dag: true,
    perioder: [
      { namn: 'Vårterminen', fran: '01-01', till: '06-30', sista_rapportdag: 'enligt kommunens anvisning' },
      { namn: 'Hösterminen', fran: '07-01', till: '12-31', sista_rapportdag: 'enligt kommunens anvisning' },
    ],
  },
};

/** Ålder vid ett visst datum. Stödens åldersgränser räknas på kalenderår. */
export function alderVidArsslut(fodelsedatum, ar) {
  if (!fodelsedatum) return null;
  return ar - Number(String(fodelsedatum).slice(0, 4));
}

/** Längden i minuter, med hänsyn till pass som går över midnatt. */
export function minuter(start, slut) {
  if (!start || !slut) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = slut.split(':').map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  if (d <= 0) d += 24 * 60;
  return d;
}

/**
 * Prövar ett tillfälle mot en regel.
 * @param {object} tillfalle  {datum, start, slut, installt, deltagare:[{medlem_id, fodelsedatum, roll, narvarande}]}
 */
export function provaTillfalle(tillfalle, regel) {
  const ar = Number(String(tillfalle.datum).slice(0, 4));
  const narvarande = (tillfalle.deltagare || []).filter((d) => d.narvarande);
  const ledare = narvarande.filter((d) => d.roll === 'ledare');
  const deltagare = narvarande.filter((d) => d.roll !== 'ledare');
  const iAlder = deltagare.filter((d) => {
    const alder = alderVidArsslut(d.fodelsedatum, ar);
    return alder != null && alder >= regel.alder_min && alder <= regel.alder_max;
  });
  const langd = minuter(tillfalle.start, tillfalle.slut);

  const brister = [];
  if (tillfalle.installt) brister.push('Tillfället är inställt');
  if (langd == null) brister.push('Tid saknas');
  else if (langd < regel.min_minuter) brister.push(`Kortare än ${regel.min_minuter} minuter`);
  if (iAlder.length < regel.min_deltagare)
    brister.push(`Färre än ${regel.min_deltagare} deltagare i åldern ${regel.alder_min}–${regel.alder_max}`);
  if (regel.ledare_kravs && !ledare.length) brister.push('Ledare saknas');
  const utanFodelsedatum = deltagare.filter((d) => !d.fodelsedatum).length;

  return {
    datum: tillfalle.datum,
    id: tillfalle.id,
    grupp: tillfalle.grupp,
    minuter: langd,
    deltagare: deltagare.length,
    deltagare_i_alder: iAlder.length,
    ledare: ledare.length,
    godkand: brister.length === 0,
    brister,
    saknar_fodelsedatum: utanFodelsedatum,
  };
}

/** Sammanställning för en period: sammankomster och deltagartillfällen. */
export function sammanstallning({ tillfallen, regel, fran, till }) {
  const provade = tillfallen.map((t) => provaTillfalle(t, regel));
  const godkanda = provade.filter((p) => p.godkand);
  const perGrupp = new Map();
  for (const p of godkanda) {
    const nyckel = p.grupp || 'Utan grupp';
    if (!perGrupp.has(nyckel)) perGrupp.set(nyckel, { grupp: nyckel, sammankomster: 0, deltagartillfallen: 0, ledartillfallen: 0 });
    const g = perGrupp.get(nyckel);
    g.sammankomster += 1;
    g.deltagartillfallen += p.deltagare_i_alder;
    g.ledartillfallen += p.ledare;
  }
  return {
    regel: { ...regel, perioder: undefined },
    fran,
    till,
    sammankomster: godkanda.length,
    deltagartillfallen: godkanda.reduce((a, p) => a + p.deltagare_i_alder, 0),
    ledartillfallen: godkanda.reduce((a, p) => a + p.ledare, 0),
    per_grupp: [...perGrupp.values()].sort((a, b) => b.deltagartillfallen - a.deltagartillfallen),
    underkanda: provade.filter((p) => !p.godkand),
    saknar_fodelsedatum: provade.reduce((a, p) => a + p.saknar_fodelsedatum, 0),
    tillfallen: provade,
  };
}

/** Perioden som ett datum hör till, enligt bidragsgivarens indelning. */
export function periodFor(regel, datum = new Date().toLocaleDateString('sv-SE')) {
  const ar = String(datum).slice(0, 4);
  const mmdd = String(datum).slice(5, 10);
  const p = regel.perioder.find((x) => mmdd >= x.fran && mmdd <= x.till) || regel.perioder[0];
  return { ...p, fran: `${ar}-${p.fran}`, till: `${ar}-${p.till}` };
}
