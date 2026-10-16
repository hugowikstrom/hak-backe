// Startar API:et med omstart vid filändring och Vites utvecklingsserver.
import { spawn } from 'node:child_process';

const barn = [
  spawn('node', ['--watch', 'server/index.mjs'], { stdio: 'inherit', env: { ...process.env, HAK_PORT: process.env.HAK_PORT || '8120' } }),
  spawn('npx', ['vite', '--config', 'web/vite.config.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite', '--config', 'web/mobil/vite.config.js'], { stdio: 'inherit' }),
];
console.log('\nAPI: http://127.0.0.1:8120   Webb: http://127.0.0.1:5190   Mobil: http://127.0.0.1:5191/mobil/\n');
const stang = () => { for (const b of barn) b.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stang);
process.on('SIGTERM', stang);
for (const b of barn) b.on('exit', (kod) => { if (kod) stang(); });
