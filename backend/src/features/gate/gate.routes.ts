import { Router } from 'express';
import { validateGateCode } from './gate.controller';
import { createRateLimiter } from '../../shared';

const router = Router();

// POST /api/gate/validate
// Receives a JSON body: { "code": "..." }
router.post('/validate', createRateLimiter({ windowMs: 60_000, max: 10, routeName: 'gate_validate' }), validateGateCode);

export default router;
