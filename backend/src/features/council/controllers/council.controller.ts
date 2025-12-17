/**
 * Council 컨트롤러
 * SSE 스트리밍을 사용하는 Council 기능의 HTTP 요청/응답 처리
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError, ErrorCodes, isOpenRouterConfigured } from '@shared';
import * as councilService from '../services';
import { processingRegistry } from '../sse';
import { streamCouncilMessage, setupSSEHeaders } from '../sse/sseStreamHandler';
import { replayAccumulatedState } from '../sse/sseReplayService';
import type { CouncilMode } from '@shared';

/**
 * 새 council 세션 생성
 */
export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  const result = await councilService.createSession(userId);

  if (!result.success) {
    const statusCode = result.code === 'SESSION_LIMIT_REACHED' ? 429 : 500;
    return res.status(statusCode).json({ error: result.error, code: result.code });
  }

  return res.status(201).json({
    sessionId: result.session.sessionId,
    title: result.session.title,
    createdAt: result.session.createdAt,
  });
});

/**
 * 사용자의 모든 council 세션 조회
 */
export const getSessions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  const result = await councilService.getSessions(userId);

  if (!result.success) {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, 500, result.error!);
  }

  const sessions = result.sessions.map((s) => ({
    sessionId: s.sessionId,
    title: s.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

  return res.json({ sessions });
});

/**
 * 메시지를 포함한 특정 council 세션 조회
 */
export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!councilService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Invalid session ID format');
  }

  const result = await councilService.getSession(userId, sessionId);

  if (!result.success) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, result.error!);
  }

  return res.json({
    sessionId: result.session.sessionId,
    title: result.session.title,
    messages: result.session.messages,
    createdAt: result.session.createdAt,
    updatedAt: result.session.updatedAt,
  });
});

/**
 * Council 세션 삭제
 */
export const deleteSession = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!councilService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Invalid session ID format');
  }

  const result = await councilService.deleteSession(userId, sessionId);

  if (!result.success) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, result.error!);
  }

  return res.status(204).send();
});

/**
 * Council에 메시지 전송 (SSE 스트리밍 응답)
 * POST 요청 JSON body: { content: string }
 */
export const sendMessage = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;
  const content = req.body?.content as string;
  const modeParam = req.body?.mode as string | undefined;

  // mode 검증 및 정규화 (기본값: 'lite')
  const validModes: CouncilMode[] = ['lite', 'ultra'];
  const mode: CouncilMode = validModes.includes(modeParam as CouncilMode)
    ? (modeParam as CouncilMode)
    : 'lite';

  // 검증
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!councilService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  const messageValidation = councilService.validateMessage(content);
  if (!messageValidation.valid) {
    return res.status(400).json({ error: messageValidation.error });
  }

  if (!isOpenRouterConfigured()) {
    console.error('OPENROUTER_API_KEY is missing');
    return res.status(500).json({ error: 'Server misconfiguration: OpenRouter API key missing' });
  }

  // 기존 처리 확인 - 이미 처리 중이면 409 반환
  if (processingRegistry.isProcessing(userId, sessionId)) {
    return res.status(409).json({
      error: 'Processing already in progress',
      code: 'ALREADY_PROCESSING',
      canReconnect: true,
    });
  }

  // 서버 용량 확인 - 최대 동시 세션 수에 도달하면 503 반환
  if (processingRegistry.isAtCapacity()) {
    console.warn(`[Council] Server at capacity (${processingRegistry.getActiveCount()} sessions)`);
    return res.status(503).json({
      error: 'Server is at capacity. Please try again later.',
      code: 'SERVER_AT_CAPACITY',
    });
  }

  // SSE 스트리밍 핸들러로 위임
  await streamCouncilMessage(res, { userId, sessionId, content, mode });
};

/**
 * 세션의 처리 상태 조회
 * GET /api/council/sessions/:sessionId/status
 */
export const getProcessingStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!councilService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Invalid session ID format');
  }

  const processing = processingRegistry.get(userId, sessionId);

  if (!processing) {
    return res.json({
      isProcessing: false,
      canReconnect: false,
    });
  }

  return res.json({
    isProcessing: true,
    canReconnect: true,
    currentStage: processing.currentStage,
    startedAt: processing.startedAt.toISOString(),
    partialResults: {
      stage1Count: processing.stage1Results.length,
      stage2Count: processing.stage2Results.length,
      hasStage3: !!processing.stage3Content,
    },
  });
});

/**
 * 진행 중인 처리에 재연결 (SSE 스트리밍)
 * GET /api/council/sessions/:sessionId/reconnect
 */
export const reconnectToProcessing = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  // 검증
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!councilService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  const processing = processingRegistry.get(userId, sessionId);

  if (!processing) {
    return res.status(404).json({
      error: 'No active processing found',
      code: 'NO_ACTIVE_PROCESSING',
    });
  }

  // SSE 설정 및 누적된 상태 재생
  setupSSEHeaders(res);
  replayAccumulatedState(res, processing);

  // 향후 이벤트를 받기 위해 이 클라이언트 추가
  processingRegistry.addClient(userId, sessionId, res);

  // 연결 끊김 처리
  res.on('close', () => {
    if (!res.writableEnded) {
      processingRegistry.removeClient(userId, sessionId, res);
    }
  });

  // 연결 유지 - 이벤트는 processingRegistry를 통해 브로드캐스트됨
  // 처리 완료 또는 클라이언트 연결 끊김 시 연결 종료
};

/**
 * 세션의 처리를 명시적으로 중단
 * POST /api/council/sessions/:sessionId/abort
 */
export const abortProcessing = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Authentication required');
  }

  if (!councilService.validateSessionId(sessionId)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 400, 'Invalid session ID format');
  }

  if (!processingRegistry.isProcessing(userId, sessionId)) {
    throw new AppError(ErrorCodes.NOT_FOUND, 404, 'No active processing found');
  }

  processingRegistry.abort(userId, sessionId);
  console.log(`[Council] Processing explicitly aborted for session ${sessionId}`);

  return res.json({ success: true });
});
