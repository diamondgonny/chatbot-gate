import { Request, Response, NextFunction } from 'express';
import { rateLimitHits, getDeploymentEnv } from '../metrics/metricsRegistry';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  routeName?: string; // For metrics tracking
}

type Bucket = { count: number; expiresAt: number };

const CLEANUP_INTERVAL_MS = 1 * 60 * 1000; // Clean up expired buckets every 1 minute

export const createRateLimiter = ({ windowMs, max, routeName = 'unknown' }: RateLimitConfig) => {
  // Per-limiter buckets to avoid cross-talk between different routes
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup to prevent memory leaks from high IP churn
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.expiresAt < now) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref(); // unref() allows process to exit cleanly

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'global';
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt < now) {
      bucket = { count: 0, expiresAt: now + windowMs };
    }

    // Pre-increment for current request
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.ceil((bucket.expiresAt - now) / 1000);

    // Update bucket
    buckets.set(key, bucket);

    // Set rate limit headers for visibility
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.expiresAt / 1000)));

    if (bucket.count > max) {
      // Track rate limit hit in metrics
      rateLimitHits.labels(routeName, getDeploymentEnv()).inc();

      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        limit: max,
        windowMs,
        retryAfter: retryAfterSeconds,
      });
    }

    next();
  };
};
