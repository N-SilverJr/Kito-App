import type { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function parseWith<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ApiError(400, 'VALIDATION_ERROR', details[0]?.message ?? 'Check the highlighted fields.', details);
  }
  return result.data;
}

export function notFound(message = 'Not found'): ApiError {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function forbidden(message = 'You do not have access to this resource'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function unauthorized(message = 'Please sign in to continue'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

export function conflict(code: string, message: string): ApiError {
  return new ApiError(409, code, message);
}

export function safeErrorBody(error: unknown, requestId: string): { status: number; body: { error: { code: string; message: string; details?: unknown; request_id: string } } } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: error.details, request_id: requestId } },
    };
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const isSqlite = /SQLITE_|constraint/i.test(message);
  return {
    status: 500,
    body: {
      error: {
        code: isSqlite ? 'DATABASE_ERROR' : 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. Please try again.',
        request_id: requestId,
      },
    },
  };
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}
