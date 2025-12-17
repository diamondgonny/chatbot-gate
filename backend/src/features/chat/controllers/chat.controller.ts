/**
 * Chat 컨트롤러
 * Chat 및 세션 기능의 HTTP 요청/응답 처리
 * 비즈니스 로직은 서비스 레이어로 위임
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError, ErrorCodes } from '@shared';
import {
  validateMessage,
  validateSessionId,
  isOpenAIConfigured,
  sendMessage,
  isSessionLimitError,
  isError,
  createSession as createSessionService,
  getUserSessions as getUserSessionsService,
  getSessionById as getSessionByIdService,
  deleteSession as deleteSessionService,
} from '../services';

// ============================================================================
// 세션 관리
// ============================================================================

/**
 * 현재 사용자를 위한 새 chat 세션 생성
 */
export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  const result = await createSessionService(userId);

  if (isSessionLimitError(result)) {
    return res.status(429).json(result);
  }

  return res.json(result);
});

/**
 * 현재 사용자의 모든 세션 조회
 */
export const getSessions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  const sessions = await getUserSessionsService(userId);
  return res.json({ sessions });
});

/**
 * ID로 특정 세션 조회
 */
export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!sessionId || !validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const session = await getSessionByIdService(userId, sessionId);

  if (!session) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Session not found');
  }

  return res.json(session);
});

/**
 * 세션 삭제
 */
export const deleteSession = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!sessionId || !validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  const deleted = await deleteSessionService(userId, sessionId);

  if (!deleted) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Session not found');
  }

  return res.json({ message: 'Session deleted successfully' });
});

// ============================================================================
// Chat 작업
// ============================================================================

/**
 * AI에 메시지를 전송하고 응답 받기
 */
export const sendChatMessage = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  const userId = req.userId;

  // 메시지 검증
  const messageValidation = validateMessage(message);
  if (!messageValidation.valid) {
    const statusCode = messageValidation.error === 'Message too long' ? 413 : 400;
    const code = statusCode === 413 ? ErrorCodes.PAYLOAD_TOO_LARGE : ErrorCodes.VALIDATION_ERROR;
    throw new AppError(code, statusCode, messageValidation.error!);
  }

  // 사용자 인증 검증
  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'User ID not found. Authentication required.');
  }

  // 세션 ID 검증
  if (!validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Valid session ID is required');
  }

  // OpenAI 설정 확인
  if (!isOpenAIConfigured()) {
    console.error('OPENAI_API_KEY is missing');
    throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 500, 'Server misconfiguration: API Key missing');
  }

  const result = await sendMessage(userId, sessionId, message);

  // 세션 제한 에러 처리
  if (isSessionLimitError(result)) {
    return res.status(429).json(result);
  }

  // 일반 에러 처리
  if (isError(result)) {
    return res.status(500).json(result);
  }

  return res.json(result);
});
