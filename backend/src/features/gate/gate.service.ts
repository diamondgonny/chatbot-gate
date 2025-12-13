/**
 * Gate Service
 * Handles authentication logic: code validation, backoff management, and logging.
 */

import { appendFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config, BACKOFF, signToken } from '../../shared';
import type { BackoffCheckResult, FailureBucket } from '../../shared';
import { gateAuthAttempts, getDeploymentEnv } from '../metrics/metrics.registry';

// In-memory storage for failure tracking
const failureBuckets = new Map<string, FailureBucket>();

const nowMs = () => Date.now();

// Periodic cleanup to prevent memory leaks from IP churn
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  const now = nowMs();
  for (const [ip, bucket] of failureBuckets) {
    if (now - bucket.lastFail > BACKOFF.FAILURE_WINDOW_MS) {
      failureBuckets.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Get the current failure bucket for an IP, with automatic decay
 */
const getBucket = (ip: string): FailureBucket => {
  const existing = failureBuckets.get(ip);
  if (!existing) return { count: 0, lastFail: 0 };

  // Decay if outside window - also delete stale entry
  if (nowMs() - existing.lastFail > BACKOFF.FAILURE_WINDOW_MS) {
    failureBuckets.delete(ip);
    return { count: 0, lastFail: 0 };
  }
  return existing;
};

/**
 * Validate access code against allowed codes
 */
export const validateCode = (code: string): boolean => {
  return config.validCodes.includes(code);
};

/**
 * Check if IP is within backoff period
 */
export const checkBackoff = (ip: string): BackoffCheckResult => {
  const bucket = getBucket(ip);
  const withinBackoff =
    bucket.count >= BACKOFF.MAX_FAILS &&
    nowMs() - bucket.lastFail < BACKOFF.SECONDS * 1000;

  if (withinBackoff) {
    const retryAfter = Math.ceil(
      (BACKOFF.SECONDS * 1000 - (nowMs() - bucket.lastFail)) / 1000
    );
    return { blocked: true, retryAfter, failures: bucket.count };
  }

  return { blocked: false };
};

/**
 * Record a failed authentication attempt
 * Returns whether IP is now in backoff state
 */
export const recordFailure = (ip: string): BackoffCheckResult => {
  const bucket = getBucket(ip);
  const updated: FailureBucket = {
    count: bucket.count + 1,
    lastFail: nowMs(),
  };
  failureBuckets.set(ip, updated);

  const inBackoff = updated.count >= BACKOFF.MAX_FAILS;
  if (inBackoff) {
    return {
      blocked: true,
      retryAfter: BACKOFF.SECONDS,
      failures: updated.count,
    };
  }

  return { blocked: false, failures: updated.count };
};

/**
 * Clear failure record for an IP (after successful auth)
 */
export const clearFailure = (ip: string): void => {
  failureBuckets.delete(ip);
};

/**
 * Generate a new user ID
 */
export const generateUserId = (): string => {
  return randomUUID();
};

/**
 * Create JWT token for user
 */
export const createAuthToken = (userId: string): string => {
  return signToken(userId);
};

/**
 * Log backoff event to file
 */
export const logBackoffEvent = (
  ip: string,
  reason: string,
  retryAfter: number,
  failures: number
): void => {
  try {
    const logPath = path.join(process.cwd(), 'logs', 'backoff.log');
    const entry = `[${new Date().toISOString()}] ip=${ip} reason=${reason} retryAfter=${retryAfter}s failures=${failures}\n`;
    appendFileSync(logPath, entry);
  } catch {
    // Fail silently; logging should not break flow
  }
};

/**
 * Record authentication attempt metric
 */
export const recordAuthMetric = (
  status: 'success' | 'failure' | 'backoff'
): void => {
  gateAuthAttempts.labels(status, getDeploymentEnv()).inc();
};
