export class AppError extends Error {
  constructor(code, message, status = 500, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorPayload(error, requestId) {
  const known = error instanceof AppError;
  return {
    ok: false,
    requestId,
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'The operation failed',
      ...(known && error.details ? { details: error.details } : {})
    }
  };
}
