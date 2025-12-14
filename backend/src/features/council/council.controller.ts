/**
 * Council Controller
 * Handles HTTP request/response for Council feature with SSE streaming.
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError, ErrorCodes, isOpenRouterConfigured } from '../../shared';
import * as councilService from './services';
import { processingRegistry } from './sse';
import { streamCouncilMessage, setupSSEHeaders } from './sse/sseStreamHandler';
import { replayAccumulatedState } from './sse/sseReplayService';
import type { CouncilMode } from '../../shared';

/**
 * Create a new council session
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
 * Get all council sessions for the user
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
 * Get a specific council session with messages
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
 * Delete a council session
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
 * Send a message to the council (SSE streaming response)
 * Accepts POST with JSON body: { content: string }
 */
export const sendMessage = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;
  const content = req.body?.content as string;
  const modeParam = req.body?.mode as string | undefined;

  // Validate and normalize mode (default to 'ultra')
  const validModes: CouncilMode[] = ['lite', 'ultra'];
  const mode: CouncilMode = validModes.includes(modeParam as CouncilMode)
    ? (modeParam as CouncilMode)
    : 'ultra';

  // Validation
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

  // Check for existing processing - return 409 if already processing
  if (processingRegistry.isProcessing(userId, sessionId)) {
    return res.status(409).json({
      error: 'Processing already in progress',
      code: 'ALREADY_PROCESSING',
      canReconnect: true,
    });
  }

  // Check server capacity - return 503 if at maximum concurrent sessions
  if (processingRegistry.isAtCapacity()) {
    console.warn(`[Council] Server at capacity (${processingRegistry.getActiveCount()} sessions)`);
    return res.status(503).json({
      error: 'Server is at capacity. Please try again later.',
      code: 'SERVER_AT_CAPACITY',
    });
  }

  // Delegate SSE streaming to handler
  await streamCouncilMessage(res, { userId, sessionId, content, mode });
};

/**
 * Get processing status for a session
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
 * Reconnect to existing processing (SSE streaming)
 * GET /api/council/sessions/:sessionId/reconnect
 */
export const reconnectToProcessing = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  // Validation
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

  // Setup SSE and replay accumulated state
  setupSSEHeaders(res);
  replayAccumulatedState(res, processing);

  // Add this client to receive future events
  processingRegistry.addClient(userId, sessionId, res);

  // Handle disconnect
  res.on('close', () => {
    if (!res.writableEnded) {
      processingRegistry.removeClient(userId, sessionId, res);
    }
  });

  // Keep connection open - events will be broadcast via processingRegistry
  // Connection will be closed when processing completes or client disconnects
};

/**
 * Explicitly abort processing for a session
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
