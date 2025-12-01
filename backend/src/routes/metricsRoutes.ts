import { Router, Request, Response } from 'express';
import { register } from '../metrics/metricsRegistry';

const router = Router();

// GET /metrics - Prometheus metrics endpoint
router.get('/', async (_req: Request, res: Response) => {
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
