/**
 * SSE Stream Handler
 * Handles SSE response setup, event streaming, and client lifecycle.
 */

import { Response } from 'express';
import type { SSEEvent, CouncilMode } from '../../../shared';
import { COUNCIL } from '../../../shared';
import { processingRegistry } from './index';
import * as councilService from '../services';

export interface StreamCouncilMessageOptions {
  userId: string;
  sessionId: string;
  content: string;
  mode: CouncilMode;
}

/**
 * Setup SSE response headers
 */
export const setupSSEHeaders = (res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
};

/**
 * Stream council message processing via SSE
 * Encapsulates the entire SSE streaming lifecycle
 */
export const streamCouncilMessage = async (
  res: Response,
  options: StreamCouncilMessageOptions
): Promise<void> => {
  const { userId, sessionId, content, mode } = options;

  // Setup SSE headers
  setupSSEHeaders(res);

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
    mode,
    abortController.signal,
    onTitleGenerated
  );

  // Register processing with registry
  processingRegistry.register(
    userId,
    sessionId,
    content,
    generator,
    abortController
  );
  processingRegistry.addClient(userId, sessionId, res);

  // Detect client disconnect - let grace period handle cleanup (allows reconnection)
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log(`[Council] Client disconnected for session ${sessionId}`);
      processingRegistry.removeClient(userId, sessionId, res);
      // Grace period (30s) will abort if no reconnection
    }
  });

  try {
    await consumeEventGenerator(generator, abortController, userId, sessionId);
  } catch (error) {
    handleStreamError(error, abortController, userId, sessionId);
  } finally {
    // Close this client's connection
    if (!res.writableEnded) {
      res.end();
    }
  }
};

/**
 * Consume events from generator and broadcast to clients
 * Includes heartbeat mechanism to keep SSE connection alive during long operations
 */
const consumeEventGenerator = async (
  generator: AsyncGenerator<SSEEvent>,
  abortController: AbortController,
  userId: string,
  sessionId: string
): Promise<void> => {
  // Start heartbeat interval to keep connection alive
  // This prevents proxy/tunnel timeouts (e.g., Cloudflare's ~100s idle timeout)
  const heartbeatInterval = setInterval(() => {
    if (!abortController.signal.aborted) {
      const heartbeatEvent: SSEEvent = { type: 'heartbeat', timestamp: Date.now() };
      // Don't record heartbeats in event history (not needed for replay)
      processingRegistry.broadcast(userId, sessionId, heartbeatEvent);
    }
  }, COUNCIL.SSE.HEARTBEAT_INTERVAL_MS);
  // Don't let heartbeat timer prevent process exit
  heartbeatInterval.unref();

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
        processingRegistry.complete(userId, sessionId, abortController);
        break;
      }
    }
  } finally {
    // Always clean up heartbeat interval
    clearInterval(heartbeatInterval);
  }
};

/**
 * Handle streaming errors
 */
const handleStreamError = (
  error: unknown,
  abortController: AbortController,
  userId: string,
  sessionId: string
): void => {
  // Ignore abort errors - these are expected when client disconnects
  if (error instanceof Error && error.name === 'AbortError') {
    console.log(`[Council] Processing aborted for session ${sessionId}`);
    processingRegistry.complete(userId, sessionId, abortController);
    return;
  }

  console.error('Council message error:', error);
  if (!abortController.signal.aborted) {
    const errorEvent = { type: 'error' as const, error: 'Processing failed' };
    processingRegistry.broadcast(userId, sessionId, errorEvent);
  }
  processingRegistry.complete(userId, sessionId, abortController);
};
