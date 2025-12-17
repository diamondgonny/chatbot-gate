import { Router, Request, Response, NextFunction } from 'express';
import { register } from '@shared/observability';

const router = Router();

// IPv6-mapped 주소 정규화 (::ffff:x.x.x.x -> x.x.x.x)
const normalizeIP = (ip: string): string => ip.replace(/^::ffff:/i, '');

// metrics 접근 허용 IP 패턴 (localhost, Docker 네트워크)
const ALLOWED_IP_PATTERNS = [
  /^127\.0\.0\.1$/,
  /^::1$/,                                       // IPv6 localhost
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,             // Docker 기본 bridge
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // Docker bridge 네트워크
  /^192\.168\.\d{1,3}\.\d{1,3}$/,                // 사설 네트워크
];

// 미들웨어: metrics 접근을 내부 IP 또는 secret token으로 제한
const metricsGuard = (req: Request, res: Response, next: NextFunction) => {
  // 옵션 1: metrics secret 확인 (외부 Prometheus용)
  const metricsSecret = process.env.METRICS_SECRET;
  if (metricsSecret && req.header('x-metrics-secret') === metricsSecret) {
    return next();
  }

  // 옵션 2: 허용된 내부 IP 확인
  const clientIp = normalizeIP(req.ip || '');
  const isAllowed = ALLOWED_IP_PATTERNS.some((pattern) => pattern.test(clientIp));

  if (isAllowed) {
    return next();
  }

  return res.status(403).json({ error: 'Metrics access denied' });
};

// GET /metrics - Prometheus metrics 엔드포인트 (내부 전용)
router.get('/', metricsGuard, async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Error collecting metrics:', error);
    res.status(500).end('Error collecting metrics');
  }
});

export default router;
