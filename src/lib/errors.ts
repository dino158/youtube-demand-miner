import type { ErrorCode } from './types';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NO_RESULTS: 422,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

// Single source of the error envelope. Unknown/unclassified errors -> INTERNAL (500),
// and must NOT leak internal messages — use a generic message for non-AppError.
export function toErrorResponse(err: unknown): Response {
  const appErr =
    err instanceof AppError
      ? err
      : new AppError('INTERNAL', 'An unexpected server error occurred');
  const body = { error: { code: appErr.code, message: appErr.message } };
  return new Response(JSON.stringify(body), {
    status: STATUS[appErr.code],
    headers: { 'Content-Type': 'application/json' },
  });
}
