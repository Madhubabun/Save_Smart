import type { Response } from 'express';
import type { ApiResponse } from '@savesmart/shared';

/** Errors that are safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found.`);

export function ok<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>): void {
  const body: ApiResponse<T> = meta ? { ok: true, data, meta } : { ok: true, data };
  res.status(status).json(body);
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: ApiResponse<never> = { ok: false, error: details === undefined ? { code, message } : { code, message, details } };
  res.status(status).json(body);
}
