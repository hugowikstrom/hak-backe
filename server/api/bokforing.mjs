// Ekonomin: verifikationer, dagsrapport, rättelser och SIE-export.
import {
  bokfor, bokforForsaljning, bokforRattelse, dagsrapport, hamta, INTAKTSKONTON,
  kontoplan, kontosaldon, revidera, revisionslogg, sakerstallKontoplan, sie4, sieKodning,
  verifikationer, SERIER,
} from '../bokforing.mjs';
import { kronor } from '../pengar.mjs';
import { alla, en, kor, spara } from '../db.mjs';
import { datum, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';
import { idag, plusDagar } from '../tid.mjs';

sakerstallKontoplan();

const period = (fraga) => ({
  fran: datum(fraga.get('fran')) || plusDagar(idag(), -30),
  till: datum(fraga.get('till')) || idag(),
});

export const rutter = [
  rutt('GET', '/api/bokforing/verifikationer', '@ekonomi_las', ({ res, fraga }) => {
    const { fran, till } = period(fraga);
    svar(res, 200, {
      fran, till,
      serier: SERIER,
      verifikationer: verifikationer({ fran, till, serie: fraga.get('serie') || null, antal: heltal(fraga.get('antal'), 500) })
        .map((v) => ({ ...v, belopp: kronor(v.belopp_ore) })),
    });
  }),

  rutt('GET', '/api/bokforing/verifikationer/:id', '@ekonomi_las', ({ res, param }) => {
    const v = hamta(param.id);
    if (!v) throw fel(404, 'Verifikationen finns inte');
    svar(res, 200, { ...v, belopp: kronor(v.belopp_ore), rattad_av: en('SELECT id, serie, nummer FROM verifikation WHERE rattar_id=?', v.id) });
  }),

  rutt('GET', '/api/bokforing/dagsrapport', '@ekonomi_las', ({ res, fraga }) => {
    const dag = datum(fraga.get('datum')) || idag();
    const r = dagsrapport(dag);
    svar(res, 200, {
      ...r,
      summa: kronor(r.summa_ore),
      moms: kronor(r.moms_ore),
      intakter: r.intakter.map((i) => ({ ...i, belopp: kronor(i.belopp_ore) })),
      betalmedel: r.betalmedel.map((b) => ({ ...b, belopp: kronor(b.belopp_ore) })),
    });
  }),

  rutt('GET', '/api/bokforing/saldon', '@ekonomi_las', ({ res, fraga }) => {
    const { fran, till } = period(fraga);
    const saldon = kontosaldon({ fran, till }).map((s) => ({
      ...s,
      debet: kronor(s.debet_ore),
      kredit: kronor(s.kredit_ore),
      saldo: kronor(s.saldo_ore),
    }));
    const intakter = saldon.filter((s) => s.slag === 'intakt').reduce((a, s) => a + (s.kredit_ore - s.debet_ore), 0);
    const kostnader = saldon.filter((s) => s.slag === 'kostnad').reduce((a, s) => a + (s.debet_ore - s.kredit_ore), 0);
    svar(res, 200, {
      fran, till, saldon,
      intakter_ore: intakter, kostnader_ore: kostnader, resultat_ore: intakter - kostnader,
      intakter: kronor(intakter), kostnader: kronor(kostnader), resultat: kronor(intakter - kostnader),
    });
  }),

  rutt('GET', '/api/bokforing/sie', '@ekonomi_las', ({ res, fraga }) => {
    const { fran, till } = period(fraga);
    const fil = sieKodning(sie4({ fran, till }));
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': fil.length,
      'content-disposition': `attachment; filename="hak-${fran}-${till}.se"`,
    });
    res.end(fil);
  }),

  rutt('GET', '/api/bokforing/konton', '@ekonomi_las', ({ res }) => svar(res, 200, kontoplan())),

  rutt('POST', '/api/bokforing/konton', '@ekonomi', ({ res, kropp, medlem }) => {
    const nummer = kravTxt(kropp.nummer, 'Kontonummer', 10);
    if (en('SELECT nummer FROM konto WHERE nummer=?', nummer)) throw fel(409, 'Kontot finns redan');
    spara('konto', {
      nummer,
      namn: kravTxt(kropp.namn, 'Namn', 80),
      slag: ettAv(kropp.slag, ['tillgang', 'skuld', 'intakt', 'kostnad'], 'Slag') || 'intakt',
      momssats: num(kropp.momssats) ?? 0,
    });
    revidera({ medlem, handelse: 'lade upp konto', objekt: nummer });
    svar(res, 201, en('SELECT * FROM konto WHERE nummer=?', nummer));
  }),

  rutt('PUT', '/api/bokforing/konton/:nummer', '@ekonomi', ({ res, param, kropp, medlem }) => {
    const k = en('SELECT * FROM konto WHERE nummer=?', param.nummer);
    if (!k) throw fel(404, 'Kontot finns inte');
    // Kontots namn får putsas. Bokförda rader rör vi aldrig – de pekar på
    // kontonumret, som inte går att ändra.
    const falt = {
      namn: txt(kropp.namn, 80),
      momssats: kropp.momssats === undefined ? undefined : num(kropp.momssats),
      aktiv: kropp.aktiv === undefined ? undefined : kropp.aktiv ? 1 : 0,
    };
    const nycklar = Object.keys(falt).filter((n) => falt[n] !== undefined);
    if (nycklar.length)
      kor(
        `UPDATE konto SET ${nycklar.map((n) => `${n}=?`).join(',')} WHERE nummer=?`,
        ...nycklar.map((n) => falt[n]),
        k.nummer
      );
    revidera({ medlem, handelse: 'ändrade konto', objekt: k.nummer, detalj: falt });
    svar(res, 200, en('SELECT * FROM konto WHERE nummer=?', k.nummer));
  }),

  /** Manuell verifikation – för det som inte går genom kassan. */
  rutt('POST', '/api/bokforing/verifikationer', '@ekonomi', ({ res, kropp, medlem }) => {
    const v = bokfor({
      serie: ettAv(kropp.serie, Object.keys(SERIER), 'Serie') || 'D',
      datum: datum(kropp.datum, 'Datum') || idag(),
      beskrivning: kravTxt(kropp.beskrivning, 'Beskrivning', 200),
      motpart: txt(kropp.motpart, 120),
      referens_slag: 'manuell',
      rader: (kropp.rader || []).map((r) => ({
        konto: kravTxt(r.konto, 'Konto', 10),
        beskrivning: txt(r.beskrivning, 120),
        debet_ore: Math.max(0, heltal(r.debet_ore, 0)),
        kredit_ore: Math.max(0, heltal(r.kredit_ore, 0)),
        momssats: num(r.momssats) ?? 0,
      })),
      av: medlem,
    });
    revidera({ medlem, handelse: 'bokförde manuellt', objekt: `${v.serie}${v.nummer}`, detalj: { belopp_ore: v.belopp_ore } });
    svar(res, 201, v);
  }),

  rutt('POST', '/api/bokforing/verifikationer/:id/rattelse', '@ekonomi', ({ res, param, kropp, medlem }) => {
    const v = bokforRattelse({ verifikation_id: heltal(param.id), anledning: txt(kropp.anledning, 200), av: medlem });
    revidera({ medlem, handelse: 'rättade verifikation', objekt: `${v.serie}${v.nummer}`, detalj: { rattar: param.id } });
    svar(res, 201, v);
  }),

  /** Medlemsavgift eller annan inbetalning från en medlem. */
  rutt('POST', '/api/bokforing/medlemsbetalning', '@ekonomi', ({ res, kropp, medlem }) => {
    const m = en('SELECT * FROM medlem WHERE id=?', heltal(kropp.medlem_id));
    if (!m) throw fel(404, 'Medlemmen finns inte');
    const belopp = Math.max(1, heltal(kropp.belopp_ore, 0));
    const v = bokforForsaljning({
      serie: 'M',
      datum: datum(kropp.datum, 'Datum') || idag(),
      beskrivning: txt(kropp.beskrivning, 200) || `Medlemsavgift ${m.namn}`,
      motpart: m.namn,
      belopp_ore: belopp,
      intaktskonto: txt(kropp.konto, 10) || INTAKTSKONTON.medlemsavgift,
      momssats: num(kropp.momssats) ?? 0,
      betalmedel: ettAv(kropp.betalmedel, ['swish', 'kort', 'kontant', 'faktura'], 'Betalmedel') || 'swish',
      referens_slag: 'medlemsavgift',
      referens_id: m.id,
      av: medlem,
    });
    revidera({ medlem, handelse: 'bokförde medlemsbetalning', objekt: m.namn, detalj: { belopp_ore: belopp } });
    svar(res, 201, v);
  }),

  rutt('GET', '/api/bokforing/revision', '@ekonomi_las', ({ res, fraga }) =>
    svar(res, 200, revisionslogg({ antal: heltal(fraga.get('antal'), 200) }))
  ),
];
