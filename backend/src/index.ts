import { createApp, createServices } from './app.js';
import { loadConfig } from './config.js';
import { MemoryStore } from './store/memoryStore.js';
import { PgStore } from './store/pgStore.js';
import type { Store } from './store/types.js';

const config = loadConfig();
const store: Store = config.databaseUrl ? new PgStore(config.databaseUrl) : new MemoryStore();
const app = createApp(config, createServices(config, store));

const server = app.listen(config.port, () => {
  console.log(`SaveSmart API listening on http://localhost:${config.port} (store: ${store.kind}, prices: ${config.priceSource === "feed" ? "licensed feed" : "demo"})`);
});

const shutdown = () => {
  server.close(() => {
    store.close().finally(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
