import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import type { Store, User } from '../store/types.js';
import { AppError, fail } from './respond.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.removeHeader('X-Powered-By');
    next();
  };
}

/** Allows only configured origins (the Vite dev server). Same-origin production needs no CORS. */
export function cors(origins: string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

/**
 * Fixed-window rate limiter per client IP. In-memory is fine for a single
 * instance; a multi-instance deployment would back this with Redis.
 */
export function rateLimit(limitPerMinute: number, bucket = 'api'): RequestHandler {
  const hits = new Map<string, { windowStart: number; count: number }>();
  return (req, res, next) => {
    if (limitPerMinute <= 0) return next();
    const now = Date.now();
    const key = `${bucket}:${req.ip}`;
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart >= 60_000) {
      hits.set(key, { windowStart: now, count: 1 });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now - v.windowStart >= 60_000) hits.delete(k);
      }
      return next();
    }
    entry.count++;
    if (entry.count > limitPerMinute) {
      res.setHeader('Retry-After', String(Math.ceil((entry.windowStart + 60_000 - now) / 1000)));
      return fail(res, 429, 'rate_limited', 'Too many requests. Please wait a moment and try again.');
    }
    next();
  };
}

/** Logs method, path, status and duration only: never bodies, tokens or query strings. */
export function requestLogger(enabled: boolean): RequestHandler {
  return (req, res, next) => {
    if (!enabled) return next();
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  };
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Resolves the user from a bearer token. Tokens are opaque random strings and only
 * their SHA-256 hash is stored. Anonymous sessions today; phone/OTP or OAuth login
 * would issue the same kind of token later.
 */
export function authenticate(store: Store): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7).trim();
      if (token.length >= 32 && token.length <= 128) {
        req.user = (await store.findUserByTokenHash(hashToken(token))) ?? undefined;
      }
    }
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'unauthorized', 'Please start a session first.'));
  next();
};

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): ZodInfer<S> {
  return schema.parse(value);
}

export function errorHandler(isProduction: boolean) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof ZodError) {
      fail(
        res,
        400,
        'invalid_request',
        'Some of the information sent was invalid.',
        err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
      return;
    }
    if (err instanceof AppError) {
      fail(res, err.status, err.code, err.message, err.details);
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      fail(res, 400, 'invalid_json', 'The request body is not valid JSON.');
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
      fail(res, 413, 'too_large', 'The request is too large.');
      return;
    }
    // Log the error type and message only, never request data.
    const message = err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown error';
    console.error(`Unhandled error: ${isProduction ? message.slice(0, 200) : err instanceof Error ? err.stack : message}`);
    fail(res, 500, 'internal_error', 'Something went wrong on our side. Please try again.');
  };
}
