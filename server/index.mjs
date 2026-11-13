// Entry point: `npm run server` (API only, for development) or `npm start` (build + game + API).
// Configuration comes from .env (never committed): MONGODB_URI, MONGODB_DB, PORT.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8787);

if (!process.env.MONGODB_URI) {
  console.warn('[db] MONGODB_URI is not set (copy .env.example to .env). Accounts are offline; guest play still works.');
}

const app = await createApp({
  mongoUri: process.env.MONGODB_URI,
  dbName: process.env.MONGODB_DB ?? 'zaikora',
  staticDir: process.argv.includes('--serve-game') ? path.join(root, 'dist') : null,
});

app.server.listen(port, () => {
  const what = process.argv.includes('--serve-game') ? 'game + API' : 'API';
  console.log(`ZAIKORA ${what} on http://localhost:${port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
