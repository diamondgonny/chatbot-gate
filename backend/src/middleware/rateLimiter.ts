import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number;
  max: number;
}

type Bucket = { count: number; expiresAt: number };

const buckets = new Map<string, Bucket>();

export const createRateLimiter = ({ windowMs, max }: RateLimitConfig) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'global';
    const now = Date.now();

    const bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt < now) {
      buckets.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.expiresAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    next();
  };
};
