import { Router } from 'express';
import { validateGateCode } from '../controllers/gate.controller';
import { createRateLimiter } from '@shared';

const router = Router();

// POST /api/gate/validate
// JSON body 수신: { "code": "..." }
router.post('/validate', createRateLimiter({ windowMs: 60_000, max: 10, routeName: 'gate_validate' }), validateGateCode);

export default router;
