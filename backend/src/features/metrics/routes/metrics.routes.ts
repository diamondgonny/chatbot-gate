import { Router, Request, Response, NextFunction } from 'express';
import { register } from '../../../shared/observability';

const router = Router();

// Normalize IPv6-mapped addresses (::ffff:x.x.x.x -> x.x.x.x)
const normalizeIP = (ip: string): string => ip.replace(/^::ffff:/i, '');

// Allowed IP patterns for metrics access (localhost, Docker networks)
const ALLOWED_IP_PATTERNS = [
  /^127\.0\.0\.1$/,
  /^::1$/,                                       // IPv6 localhost
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,             // Docker default bridge
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // Docker bridge networks
  /^192\.168\.\d{1,3}\.\d{1,3}$/,                // Private networks
];

// Middleware: restrict metrics to internal IPs or secret token
const metricsGuard = (req: Request, res: Response, next: NextFunction) => {
  // Option 1: Check for metrics secret (for external Prometheus)
  const metricsSecret = process.env.METRICS_SECRET;
  if (metricsSecret && req.header('x-metrics-secret') === metricsSecret) {
    return next();
  }

  // Option 2: Check for allowed internal IPs
  const clientIp = normalizeIP(req.ip || '');
  const isAllowed = ALLOWED_IP_PATTERNS.some((pattern) => pattern.test(clientIp));

  if (isAllowed) {
    return next();
  }

  return res.status(403).json({ error: 'Metrics access denied' });
};

// GET /metrics - Prometheus metrics endpoint (internal only)
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
