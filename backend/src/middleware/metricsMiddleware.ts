import { Request, Response, NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsInProgress,
  getDeploymentEnv,
} from '../metrics/metricsRegistry';

// Route normalization to avoid high cardinality
const normalizeRoute = (req: Request): string => {
  const route = req.route?.path || req.path;

  // Replace UUID patterns with :id placeholder
  return route.replace(
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

  // Track if we've already recorded metrics to avoid double-counting
  let metricsRecorded = false;

  const recordMetrics = (completed: boolean) => {
    if (metricsRecorded) return;
    metricsRecorded = true;

    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;

    // Only record request/duration metrics if response completed normally
    if (completed) {
      const normalizedRoute = normalizeRoute(req);
      const statusCode = res.statusCode.toString();

      httpRequestsTotal.labels(req.method, normalizedRoute, statusCode, deploymentEnv).inc();
      httpRequestDuration.labels(req.method, normalizedRoute, statusCode, deploymentEnv).observe(durationSeconds);
    }

    httpRequestsInProgress.labels(req.method, routePrefix, deploymentEnv).dec();
  };

  // 'finish' fires when response sent successfully
  res.on('finish', () => recordMetrics(true));

  // 'close' fires if connection terminated before finish (client disconnect)
  res.on('close', () => recordMetrics(false));

  next();
};
