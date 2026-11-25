// Externa IoT-enheter (väderstation och givare) via Feeder-serverns API.
import { enhet, enheter } from '../feeder.mjs';
import { rutt, svar } from '../http.mjs';

export const rutter = [
  rutt('GET', '/api/enheter', 'medlem', async ({ res }) => svar(res, 200, await enheter())),

  rutt('GET', '/api/enheter/:id', 'medlem', async ({ res, param }) =>
    svar(res, 200, await enhet(param.id))
  ),
];
