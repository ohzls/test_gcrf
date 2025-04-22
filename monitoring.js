// monitoring.js

export function measurePerformance(fn) {
  return async (...args) => {
    const start = Date.now();
    try {
      return await fn(...args);
    } finally {
      const duration = Date.now() - start;
      console.log(`[Performance] ${fn.name} took ${duration}ms`);
    }
  };
}

export function logRequest(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${duration}ms`);
  });
  next();
} 