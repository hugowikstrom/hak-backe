// Väderprognos för backen.
import { prognos } from '../vader.mjs';
import { rutt, svar } from '../http.mjs';

export const rutter = [
  rutt('GET', '/api/vader', 'medlem', async ({ res }) => svar(res, 200, await prognos())),

  rutt('POST', '/api/vader/uppdatera', 'medlem', async ({ res }) =>
    svar(res, 200, await prognos({ tvinga: true }))
  ),
];
