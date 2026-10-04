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
  };
}
