import { Request, Response, NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsInProgress,
  getDeploymentEnv,
} from '@shared/observability';

// 높은 카디널리티를 피하기 위한 라우트 정규화
const normalizeRoute = (req: Request): string => {
  // 일관된 전체 경로 레이블을 위해 항상 baseUrl + route path 사용
  // OPTIONS (preflight)와 실제 요청이 동일한 라우트 레이블을 받도록 보장
  const fullPath = req.baseUrl + (req.route?.path || req.path);

  // UUID 패턴을 :id 플레이스홀더로 교체
  return fullPath.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    ':id'
  );
};

const getRoutePrefix = (path: string): string => {
  const segments = path.split('/').filter(Boolean);
  if (segments.length >= 2 && segments[0] === 'api') {
    return `/api/${segments[1]}`;
  }
  return path;
};

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const deploymentEnv = getDeploymentEnv();
  const startTime = process.hrtime.bigint();
  const routePrefix = getRoutePrefix(req.originalUrl || req.url);

  httpRequestsInProgress.labels(req.method, routePrefix, deploymentEnv).inc();

  // 이중 계산을 피하기 위해 메트릭을 이미 기록했는지 추적
  let metricsRecorded = false;

  const recordMetrics = (completed: boolean) => {
    if (metricsRecorded) return;
    metricsRecorded = true;

    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;

    // 응답이 정상적으로 완료된 경우에만 요청/기간 메트릭 기록
    if (completed) {
      const normalizedRoute = normalizeRoute(req);
      const statusCode = res.statusCode.toString();

      httpRequestsTotal.labels(req.method, normalizedRoute, statusCode, deploymentEnv).inc();
      httpRequestDuration.labels(req.method, normalizedRoute, statusCode, deploymentEnv).observe(durationSeconds);
    }

    httpRequestsInProgress.labels(req.method, routePrefix, deploymentEnv).dec();
  };

  // 응답이 성공적으로 전송될 때 'finish' 발생
  res.once('finish', () => recordMetrics(true));

  // finish 전에 연결이 종료되면 'close' 발생 (클라이언트 연결 해제)
  res.once('close', () => recordMetrics(false));

  next();
};
