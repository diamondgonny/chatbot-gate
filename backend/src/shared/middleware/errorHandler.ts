/**
 * 에러 핸들러 미들웨어
 * AppError를 지원하는 중앙화된 에러 처리
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

/**
 * Express 에러 처리 미들웨어
 * - AppError: 적절한 상태 코드 및 에러 코드와 함께 처리
 * - 알 수 없는 에러: 500으로 폴백 (내부 세부사항 노출 방지)
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const errorId = Date.now().toString(36);

  console.error(`[${errorId}]`, err);

  // 애플리케이션 에러 처리
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId: errorId,
    });
    return;
  }

  // 알 수 없는 에러 처리 (내부 세부사항 노출 방지)
  const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
  res.status(statusCode).json({
    error: 'Internal server error',
    requestId: errorId,
  });
};
