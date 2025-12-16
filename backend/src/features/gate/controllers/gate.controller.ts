/**
 * Gate Controller
 * Handles HTTP request/response for gate authentication.
 * Business logic delegated to gateService.
 */

import { Request, Response } from 'express';
import { cookieConfig } from '../../../shared';
import * as gateService from '../gate.service';

export const validateGateCode = (req: Request, res: Response) => {
  const { code, userId: existingUserId } = req.body;
  const ip = req.ip || 'global';

  // Check if IP is within backoff period
  const backoffStatus = gateService.checkBackoff(ip);
  if (backoffStatus.blocked) {
    const retryAfter = backoffStatus.retryAfter!;
    gateService.logBackoffEvent(ip, 'backoff', retryAfter, backoffStatus.failures!);
    gateService.recordAuthMetric('backoff');

    res.setHeader('Retry-After', retryAfter.toString());
    return res.status(429).json({
      error: 'Too many invalid attempts. Please wait before retrying.',
      code: 'GATE_BACKOFF',
      retryAfter,
    });
  }

  // Validate request
  if (!code) {
    return res.status(400).json({ valid: false, message: 'Code is required' });
  }

  // Check if code is valid
  if (gateService.validateCode(code)) {
    gateService.clearFailure(ip);
    gateService.recordAuthMetric('success');

    // Reuse existing userId or generate new one
    const userId = existingUserId || gateService.generateUserId();

    // Create JWT token
    const token = gateService.createAuthToken(userId);

    // Set JWT as HttpOnly cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      domain: cookieConfig.domain,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return res.json({
      valid: true,
      message: 'Access granted',
      userId,
    });
  } else {
    // Record failure and check if now in backoff
    const failureResult = gateService.recordFailure(ip);
    gateService.recordAuthMetric('failure');

    if (failureResult.blocked) {
      const retryAfter = failureResult.retryAfter!;
      gateService.logBackoffEvent(
        ip,
        'enter-backoff',
        retryAfter,
        failureResult.failures!
      );

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
