/**
 * IP 기반 레이트 리미터
 *
 * 싱글톤 cleanup 패턴:
 * - 각 라우트별 리미터는 독립적인 버킷 Map을 가짐
 * - 모든 버킷 Map을 allBuckets에 등록하여 단일 타이머로 만료된 버킷 정리
 * - 메모리 누수 방지 및 리소스 효율화
 */

import { Request, Response, NextFunction } from 'express';
import { rateLimitHits, getDeploymentEnv } from '../observability';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  routeName?: string;  // 메트릭 추적용
}

type Bucket = { count: number; expiresAt: number };

const CLEANUP_INTERVAL_MS = 1 * 60 * 1000;

// 모든 리미터의 버킷 Map을 추적하여 단일 타이머로 정리
const allBuckets: Map<string, Bucket>[] = [];
let cleanupStarted = false;

function ensureCleanupInterval(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;

  // 만료된 버킷 주기적 정리 (메모리 누수 방지)
  // .unref(): 이 타이머가 프로세스 종료를 차단하지 않도록 함
  setInterval(() => {
    const now = Date.now();
    for (const buckets of allBuckets) {
      for (const [key, bucket] of buckets) {
        if (bucket.expiresAt < now) {
          buckets.delete(key);
        }
      }
    }
  }, CLEANUP_INTERVAL_MS).unref();
}

export const createRateLimiter = ({ windowMs, max, routeName = 'unknown' }: RateLimitConfig) => {
  // 라우트별 독립 버킷 (라우트 간 간섭 방지)
  const buckets = new Map<string, Bucket>();
  allBuckets.push(buckets);
  ensureCleanupInterval();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'global';
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt < now) {
      bucket = { count: 0, expiresAt: now + windowMs };
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.ceil((bucket.expiresAt - now) / 1000);

    buckets.set(key, bucket);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.expiresAt / 1000)));

    if (bucket.count > max) {
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
