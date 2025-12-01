import { Router } from 'express';
import { validateGateCode } from '../controllers/gateController';
import { createRateLimiter } from '../middleware/rateLimiter';

// Router: Defines the API endpoints and maps them to controller functions.
// In Spring, this is the @RequestMapping at the class level.
// In FastAPI, this is `router = APIRouter()`.

const router = Router();

// POST /api/gate/validate
// Receives a JSON body: { "code": "..." }
router.post('/validate', createRateLimiter({ windowMs: 60_000, max: 10, routeName: 'gate_validate' }), validateGateCode);

export default router;
