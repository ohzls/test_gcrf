// errorHandler.js

export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

export function handleError(err, req, res, next) {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    error: err.message || '서버 오류가 발생했습니다.',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
} 