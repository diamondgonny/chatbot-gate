/**
 * Gate 컨트롤러
 * Gate 인증의 HTTP 요청/응답 처리
 * 비즈니스 로직은 gateService로 위임
 */

import { Request, Response } from 'express';
import { cookieConfig } from '@shared';
import * as gateService from '../services/gate.service';

export const validateGateCode = (req: Request, res: Response) => {
  const { code, userId: existingUserId } = req.body;
  const ip = req.ip || 'global';

  // IP가 backoff 기간 내에 있는지 확인
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

  // 요청 검증
  if (!code) {
    return res.status(400).json({ valid: false, message: 'Code is required' });
  }

  // 코드 유효성 확인
  if (gateService.validateCode(code)) {
    gateService.clearFailure(ip);
    gateService.recordAuthMetric('success');

    // 기존 userId 재사용 또는 새로 생성
    const userId = existingUserId || gateService.generateUserId();

    // JWT token 생성
    const token = gateService.createAuthToken(userId);

    // HttpOnly 쿠키로 JWT 설정
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
    // 실패 기록 및 backoff 상태 확인
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
