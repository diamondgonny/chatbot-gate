/**
 * Gate 서비스
 * 인증 로직 처리: 코드 검증, backoff 관리 및 로깅
 */

import { appendFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config, BACKOFF, signToken } from '@shared';
import type { BackoffCheckResult, FailureBucket } from '@shared';
import { gateAuthAttempts, getDeploymentEnv } from '@shared';

// 실패 추적을 위한 메모리 내 스토리지
const failureBuckets = new Map<string, FailureBucket>();

const nowMs = () => Date.now();

// IP 변경으로 인한 메모리 누수 방지를 위한 주기적 정리
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5분
setInterval(() => {
  const now = nowMs();
  for (const [ip, bucket] of failureBuckets) {
    if (now - bucket.lastFail > BACKOFF.FAILURE_WINDOW_MS) {
      failureBuckets.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * IP에 대한 현재 실패 버킷 가져오기, 자동 감쇠 적용
 */
const getBucket = (ip: string): FailureBucket => {
  const existing = failureBuckets.get(ip);
  if (!existing) return { count: 0, lastFail: 0 };

  // 윈도우 밖이면 감쇠 - 오래된 엔트리도 삭제
  if (nowMs() - existing.lastFail > BACKOFF.FAILURE_WINDOW_MS) {
    failureBuckets.delete(ip);
    return { count: 0, lastFail: 0 };
  }
  return existing;
};

/**
 * 허용된 코드에 대해 접근 코드 검증
 */
export const validateCode = (code: string): boolean => {
  return config.validCodes.includes(code);
};

/**
 * IP가 backoff 기간 내에 있는지 확인
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
 * 실패한 인증 시도 기록
 * IP가 이제 backoff 상태인지 여부 반환
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
 * IP의 실패 기록 정리 (성공적인 인증 후)
 */
export const clearFailure = (ip: string): void => {
  failureBuckets.delete(ip);
};

/**
 * 새 사용자 ID 생성
 */
export const generateUserId = (): string => {
  return randomUUID();
};

/**
 * 사용자를 위한 JWT token 생성
 */
export const createAuthToken = (userId: string): string => {
  return signToken(userId);
};

/**
 * backoff 이벤트를 파일에 로깅
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
    // 조용히 실패; 로깅이 흐름을 방해해서는 안 됨
  }
};

/**
 * 인증 시도 메트릭 기록
 */
export const recordAuthMetric = (
  status: 'success' | 'failure' | 'backoff'
): void => {
  gateAuthAttempts.labels(status, getDeploymentEnv()).inc();
};
