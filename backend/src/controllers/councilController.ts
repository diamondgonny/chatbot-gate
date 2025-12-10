/**
 * Council Controller
 * Handles HTTP request/response for Council feature with SSE streaming.
 */

import { Request, Response } from 'express';
import * as councilService from '../services/councilService';
import { isOpenRouterConfigured } from '../services/openRouterService';

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

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Flush headers immediately
  res.flushHeaders();

  // Create abort controller for client disconnect handling
  const abortController = new AbortController();

  // Detect client disconnect and abort processing
  req.on('close', () => {
    if (!res.writableEnded) {
      console.log(`[Council] Client disconnected for session ${sessionId}, aborting processing`);
      abortController.abort();
    }
  });

  try {
    const generator = councilService.processCouncilMessage(
      userId,
      sessionId,
      content,
      abortController.signal
    );

    for await (const event of generator) {
      // Check if client disconnected before writing
      if (abortController.signal.aborted) {
        break;
      }

      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Ensure data is flushed immediately
      if (typeof (res as Response & { flush?: () => void }).flush === 'function') {
        (res as Response & { flush?: () => void }).flush?.();
      }
    }
  } catch (error) {
    // Ignore abort errors - these are expected when client disconnects
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[Council] Processing aborted for session ${sessionId}`);
      return;
    }
    console.error('Council message error:', error);
    if (!abortController.signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Processing failed' })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
};
