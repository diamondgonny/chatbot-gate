/**
 * Application Error
 * 일관된 에러 처리를 위한 코드 및 상태를 포함하는 커스텀 에러 클래스
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 애플리케이션 전반의 일관성을 위한 공통 에러 코드
 */
export const ErrorCodes = {
  // 검증 에러 (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // 서버 에러 (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
