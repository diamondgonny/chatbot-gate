/**
 * Council Controller
 * Handles HTTP request/response for Council feature with SSE streaming.
 */

import { Request, Response } from 'express';
import * as councilService from '../services/councilService';
import { isOpenRouterConfigured } from '../services/openRouterService';
import { processingRegistry } from '../services/processingRegistry';

/**
 * Create a new council session
 */
export const createSession = async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
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
  } catch (error) {
    console.error('Error creating council session:', error);
    return res.status(500).json({ error: 'Failed to create session' });
  }
};

/**
 * Get all council sessions for the user
 */
export const getSessions = async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await councilService.getSessions(userId);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    const sessions = result.sessions.map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return res.json({ sessions });
  } catch (error) {
    console.error('Error fetching council sessions:', error);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

/**
 * Get a specific council session with messages
 */
export const getSession = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!councilService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    const result = await councilService.getSession(userId, sessionId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    return res.json({
      sessionId: result.session.sessionId,
      title: result.session.title,
      messages: result.session.messages,
      createdAt: result.session.createdAt,
      updatedAt: result.session.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching council session:', error);
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
};

/**
 * Delete a council session
 */
export const deleteSession = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!councilService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    const result = await councilService.deleteSession(userId, sessionId);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting council session:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
};

/**
 * Send a message to the council (SSE streaming response)
 * Accepts POST with JSON body: { content: string }
 */
export const sendMessage = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;
  const content = req.body?.content as string;

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

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Flush headers immediately
  res.flushHeaders();

  // Create abort controller for client disconnect handling
  const abortController = new AbortController();

  // Create title callback for immediate broadcast
  const onTitleGenerated = (title: string) => {
    const titleEvent = { type: 'title_complete' as const, data: { title } };
    processingRegistry.recordEvent(userId, sessionId, titleEvent);
    processingRegistry.broadcast(userId, sessionId, titleEvent);
  };

  // Create generator
  const generator = councilService.processCouncilMessage(
    userId,
    sessionId,
    content,
    abortController.signal,
    onTitleGenerated
  );

  // Register processing with registry
  const processing = processingRegistry.register(
    userId,
    sessionId,
    content,
    generator,
    abortController
  );
  processing.clients.add(res);

  // Detect client disconnect - let grace period handle cleanup (allows reconnection)
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log(`[Council] Client disconnected for session ${sessionId}`);
      processingRegistry.removeClient(userId, sessionId, res);
      // Grace period (30s) will abort if no reconnection
    }
  });

  try {
    for await (const event of generator) {
      // Check if aborted
      if (abortController.signal.aborted) {
        break;
      }

      // Record event in registry for replay on reconnection
      processingRegistry.recordEvent(userId, sessionId, event);

      // Broadcast to all connected clients
      processingRegistry.broadcast(userId, sessionId, event);

      // Mark complete on final events
      if (event.type === 'complete' || event.type === 'error') {
        processingRegistry.complete(userId, sessionId);
        break;
      }
    }
  } catch (error) {
    // Ignore abort errors - these are expected when client disconnects
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[Council] Processing aborted for session ${sessionId}`);
      processingRegistry.complete(userId, sessionId);
      return;
    }
    console.error('Council message error:', error);
    if (!abortController.signal.aborted) {
      const errorEvent = { type: 'error' as const, error: 'Processing failed' };
      processingRegistry.broadcast(userId, sessionId, errorEvent);
    }
    processingRegistry.complete(userId, sessionId);
  } finally {
    // Close this client's connection
    if (!res.writableEnded) {
      res.end();
    }
  }
};

/**
 * Get processing status for a session
 * GET /api/council/sessions/:sessionId/status
 */
export const getProcessingStatus = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!councilService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
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
};

/**
 * Reconnect to existing processing (SSE streaming)
 * GET /api/council/sessions/:sessionId/reconnect
 */
export const reconnectToProcessing = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

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

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Replay accumulated state based on current stage
  const hasStage1Data = processing.stage1Results.length > 0 || Object.keys(processing.stage1StreamingContent).length > 0;
  const hasStage2Data = processing.stage2Results.length > 0 || Object.keys(processing.stage2StreamingContent).length > 0;
  const hasStage3Data = !!processing.stage3Content;

  // 1. Stage 1 replay
  if (hasStage1Data || processing.currentStage === 'stage1') {
    res.write(`data: ${JSON.stringify({ type: 'stage1_start' })}\n\n`);
    // Send completed responses
    for (const result of processing.stage1Results) {
      res.write(`data: ${JSON.stringify({ type: 'stage1_response', data: result })}\n\n`);
    }
    // Send streaming content for models still in progress
    if (processing.currentStage === 'stage1') {
      for (const [model, content] of Object.entries(processing.stage1StreamingContent)) {
        if (content) {
          res.write(`data: ${JSON.stringify({ type: 'stage1_chunk', model, delta: content })}\n\n`);
        }
      }
    }
    // Only send complete if Stage 1 is actually done
    if (processing.currentStage !== 'stage1') {
      res.write(`data: ${JSON.stringify({ type: 'stage1_complete' })}\n\n`);
    }
  }

  // 2. Stage 2 replay
  if (hasStage2Data || processing.currentStage === 'stage2') {
    res.write(`data: ${JSON.stringify({ type: 'stage2_start' })}\n\n`);
    // Send completed responses
    for (const result of processing.stage2Results) {
      res.write(`data: ${JSON.stringify({ type: 'stage2_response', data: result })}\n\n`);
    }
    // Send streaming content for models still in progress
    if (processing.currentStage === 'stage2') {
      for (const [model, content] of Object.entries(processing.stage2StreamingContent)) {
        if (content) {
          res.write(`data: ${JSON.stringify({ type: 'stage2_chunk', model, delta: content })}\n\n`);
        }
      }
    }
    // Only send complete if Stage 2 is actually done (has labelToModel data)
    if (processing.currentStage !== 'stage2' && Object.keys(processing.labelToModel).length > 0) {
      res.write(`data: ${JSON.stringify({
        type: 'stage2_complete',
        data: {
          labelToModel: processing.labelToModel,
          aggregateRankings: processing.aggregateRankings,
        },
      })}\n\n`);
    }
  }

  // 3. Stage 3 replay
  if (hasStage3Data || processing.currentStage === 'stage3') {
    res.write(`data: ${JSON.stringify({ type: 'stage3_start' })}\n\n`);
    // Send accumulated content as a single chunk
    if (processing.stage3Content) {
      res.write(`data: ${JSON.stringify({ type: 'stage3_chunk', delta: processing.stage3Content })}\n\n`);
    }
  }

  // 4. Send reconnection marker with current stage
  res.write(`data: ${JSON.stringify({
    type: 'reconnected',
    stage: processing.currentStage,
    userMessage: processing.userMessage,
  })}\n\n`);

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
export const abortProcessing = async (req: Request, res: Response) => {
  const userId = req.userId;
  const { sessionId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!councilService.validateSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  if (!processingRegistry.isProcessing(userId, sessionId)) {
    return res.status(404).json({ error: 'No active processing found' });
  }

  processingRegistry.abort(userId, sessionId);
  console.log(`[Council] Processing explicitly aborted for session ${sessionId}`);

  return res.json({ success: true });
};
