import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { PLATFORM_IDS } from '@savesmart/shared';
import { DEMO_CATALOG, DemoDataProvider, FeedAdapter, createDemoAdapters, type PlatformAdapter } from '@savesmart/platform-adapters';
import { CommunityAdapter, LayeredAdapter } from './services/community.js';
import type { Config } from './config.js';
import { authenticate, cors, errorHandler, rateLimit, requestLogger, securityHeaders } from './http/middleware.js';
import { fail } from './http/respond.js';
import { createRoutes, type Services } from './routes.js';
import { CatalogService } from './services/catalog.js';
import { ComparisonService } from './services/comparison.js';
import { PriceService } from './services/prices.js';
import type { Store } from './store/types.js';

export function createServices(config: Config, store: Store): Services {
  const demo = config.priceSource === 'demo' ? new DemoDataProvider() : null;
  // Real prices: the licensed feed when configured, with community reports filling its gaps.
  const community = PLATFORM_IDS.map((id) => new CommunityAdapter(id, store, DEMO_CATALOG));
  const adapters: PlatformAdapter[] = demo
    ? createDemoAdapters(demo, { latencyMs: config.demoLatencyMs })
    : community.map((c) => new LayeredAdapter(config.priceFeed ? new FeedAdapter(c.id, config.priceFeed) : null, c));
  const comparison = new ComparisonService(adapters, config.platformTimeoutMs, DEMO_CATALOG);
  return {
    store,
    catalog: new CatalogService(DEMO_CATALOG),
    comparison,
    prices: new PriceService(comparison, store, demo),
    priceSource: config.priceSource,
    community: demo ? [] : community,
  };
}

export function createApp(config: Config, services: Services, opts: { log?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(securityHeaders());
  app.use(requestLogger(opts.log ?? true));

  const api = express.Router();
  api.use(cors(config.corsOrigins));
  api.use(rateLimit(config.rateLimitPerMinute));
  api.use(express.json({ limit: '64kb' }));
  api.use(authenticate(services.store));
  api.use(createRoutes(services, { compareRateLimitPerMinute: config.compareRateLimitPerMinute }));
  api.use((_req, res) => fail(res, 404, 'not_found', 'This API route does not exist.'));
  api.use(errorHandler(config.isProduction));
  app.use('/api', api);

  // In production the API also serves the built web app.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (config.serveFrontend && existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return app;
}
