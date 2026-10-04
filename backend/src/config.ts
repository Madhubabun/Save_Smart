/** Reads configuration from environment variables. Secrets never have defaults and are never logged. */
export interface Config {
  port: number;
  databaseUrl: string | null;
  corsOrigins: string[];
  rateLimitPerMinute: number;
  compareRateLimitPerMinute: number;
  /** Per-platform timeout: a slow platform must not stall the whole comparison. */
  platformTimeoutMs: number;
  /** Simulated latency of the demo data sources. */
  demoLatencyMs: number;
  serveFrontend: boolean;
  isProduction: boolean;
  /**
   * Where prices come from.
   * "community": prices SaveSmart users saw in the apps and shared (the default).
   * "feed": a licensed price feed (PRICE_FEED_URL + PRICE_FEED_KEY), with community prices filling its gaps.
   * "demo": generated sample data for development and tests, always labelled in the app.
   */
  priceSource: 'feed' | 'community' | 'demo';
  priceFeed: { baseUrl: string; apiKey: string } | null;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Environment variable ${name} must be a non-negative integer.`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: int('PORT', 8787),
    databaseUrl: env.DATABASE_URL?.trim() || null,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 120),
    compareRateLimitPerMinute: int('COMPARE_RATE_LIMIT_PER_MINUTE', 30),
    platformTimeoutMs: int('PLATFORM_TIMEOUT_MS', 4000),
    demoLatencyMs: int('DEMO_LATENCY_MS', 120),
    serveFrontend: env.SERVE_FRONTEND !== 'false',
    isProduction: env.NODE_ENV === 'production',
    ...priceSource(env),
  };
}

function priceSource(env: NodeJS.ProcessEnv): Pick<Config, 'priceSource' | 'priceFeed'> {
  const url = env.PRICE_FEED_URL?.trim();
  const key = env.PRICE_FEED_KEY?.trim();
  const source = env.PRICE_SOURCE?.trim() || (url ? 'feed' : 'community');
  if (source === 'demo' || source === 'community') return { priceSource: source, priceFeed: null };
  if (source !== 'feed') throw new Error('PRICE_SOURCE must be "community", "feed" or "demo".');
  if (!url || !key) throw new Error('PRICE_SOURCE=feed needs PRICE_FEED_URL and PRICE_FEED_KEY.');
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) throw new Error('PRICE_FEED_URL must use https.');
  return { priceSource: 'feed', priceFeed: { baseUrl: url, apiKey: key } };
}
