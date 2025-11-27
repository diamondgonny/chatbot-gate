import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { signToken } from '../utils/jwtUtils';
import { appendFileSync } from 'fs';
import path from 'path';

const FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes window to decay failures
const BACKOFF_FAILS = 5;
const BACKOFF_SECONDS = 30;

type FailureState = { count: number; lastFail: number };
const failureBuckets = new Map<string, FailureState>();

const nowMs = () => Date.now();

const getBucket = (key: string): FailureState => {
  const existing = failureBuckets.get(key);
  if (!existing) return { count: 0, lastFail: 0 };
  // decay if outside window
  if (nowMs() - existing.lastFail > FAILURE_WINDOW_MS) {
    return { count: 0, lastFail: 0 };
  }
  return existing;
};

const recordFailure = (key: string) => {
  const bucket = getBucket(key);
  const updated: FailureState = {
    count: bucket.count + 1,
    lastFail: nowMs(),
  };
  failureBuckets.set(key, updated);
  return updated;
};

const clearFailure = (key: string) => {
  failureBuckets.delete(key);
};

// Controller: Handles the business logic for incoming requests.
// In Spring, this would be a method inside a @RestController class.
// In FastAPI, this is the function decorated with @app.post(...).

export const validateGateCode = (req: Request, res: Response) => {
  const { code, userId: existingUserId } = req.body;
  const key = req.ip || 'global';
  const bucket = getBucket(key);
  const withinBackoff =
    bucket.count >= BACKOFF_FAILS &&
    nowMs() - bucket.lastFail < BACKOFF_SECONDS * 1000;

  if (withinBackoff) {
    const retryAfter = Math.ceil(
      (BACKOFF_SECONDS * 1000 - (nowMs() - bucket.lastFail)) / 1000
    );
    try {
      const logPath = path.join(process.cwd(), 'logs', 'backoff.log');
      const entry = `[${new Date().toISOString()}] ip=${key} reason=backoff retryAfter=${retryAfter}s failures=${bucket.count}\n`;
      appendFileSync(logPath, entry);
    } catch (e) {
      // fail silently; logging should not break flow
    }
    res.setHeader('Retry-After', retryAfter.toString());
    return res.status(429).json({
      error: 'Too many invalid attempts. Please wait before retrying.',
      code: 'GATE_BACKOFF',
      retryAfter,
    });
  }

  if (!code) {
    return res.status(400).json({ valid: false, message: 'Code is required' });
  }

  // Check if the provided code exists in our allowed list
  const isValid = config.validCodes.includes(code);

  if (isValid) {
    clearFailure(key);
    // Reuse existing userId or generate new one
    const userId = existingUserId || uuidv4();
    
    // Sign JWT token with userId in payload
    const token = signToken(userId);
    
    // Set JWT as HttpOnly cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    
    return res.json({ 
      valid: true, 
      message: 'Access granted',
      userId,  // Send userId for client storage
    });
  } else {
    const updated = recordFailure(key);
    const inBackoff = updated.count >= BACKOFF_FAILS;
    const retryAfter = inBackoff ? BACKOFF_SECONDS : undefined;
    if (inBackoff && retryAfter) {
      try {
        const logPath = path.join(process.cwd(), 'logs', 'backoff.log');
        const entry = `[${new Date().toISOString()}] ip=${key} reason=enter-backoff retryAfter=${retryAfter}s failures=${updated.count}\n`;
        appendFileSync(logPath, entry);
      } catch (e) {
        // fail silently; logging should not break flow
      }
      res.setHeader('Retry-After', retryAfter.toString());
      return res.status(429).json({
        valid: false,
        message: 'Too many invalid attempts. Please wait before retrying.',
        code: 'GATE_BACKOFF',
        retryAfter,
      });
    }
    return res.status(401).json({ valid: false, message: 'Invalid code' });
  }
};
