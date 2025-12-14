/**
 * Message Service
 * Handles chat message processing and validation.
 */

import {
  ChatSession,
  SESSION,
  CHAT,
  chatMessagesTotal,
  chatMessageDuration,
  getDeploymentEnv,
} from '../../../shared';
import type { ChatMessageResponse, ChatHistoryResponse, SessionLimitError } from '../../../shared';
import { getCompletion, buildConversationHistory } from './openai.service';

/**
 * Truncate text to specified length with ellipsis
 */
const truncateTitle = (text: string, maxLength = 50): string =>
  text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

/**
 * Validate message content
 */
export const validateMessage = (
  message: unknown
): { valid: boolean; error?: string } => {
  if (typeof message !== 'string' || !message.trim()) {
    return { valid: false, error: 'Message is required' };
  }
  if (message.length > CHAT.MAX_MESSAGE_LENGTH) {
    return { valid: false, error: 'Message too long' };
  }
  return { valid: true };
};

/**
 * Validate session ID format
 */
export const validateSessionId = (sessionId: unknown): boolean => {
  return (
    typeof sessionId === 'string' && SESSION.ID_PATTERN.test(sessionId)
  );
};

export type SendMessageResult =
  | ChatMessageResponse
  | SessionLimitError
  | { error: string };

/**
 * Send a message and get AI response
 * Handles session creation, message storage, and OpenAI API interaction
 */
export const sendMessage = async (
  userId: string,
  sessionId: string,
  message: string
): Promise<SendMessageResult> => {
  const chatStartTime = process.hrtime.bigint();
  const deploymentEnv = getDeploymentEnv();

  // Find or create chat session
  let session = await ChatSession.findOne({ userId, sessionId });
  let isNewSession = false;

  if (!session) {
    // Check session limit before creating new session
    const sessionCount = await ChatSession.countDocuments({ userId });
    if (sessionCount >= SESSION.MAX_PER_USER) {
      return {
        error: 'Session limit reached. Delete old sessions to continue.',
        code: 'SESSION_LIMIT_REACHED',
        limit: SESSION.MAX_PER_USER,
        count: sessionCount,
      };
    }

    session = new ChatSession({
      userId,
      sessionId,
      messages: [],
      title: 'New Chat',
    });
    isNewSession = true;
  }

  // Add user message to session
  session.messages.push({
    role: 'user',
    content: message,
    timestamp: new Date(),
  });

  // Auto-generate title from first user message
  if (session.messages.length === 1) {
    session.title = truncateTitle(message);
  }

  await session.save();

  // Double-check session limit after save to prevent race condition
  if (isNewSession) {
    const finalCount = await ChatSession.countDocuments({ userId });
    if (finalCount > SESSION.MAX_PER_USER) {
      // Rollback
      await ChatSession.deleteOne({ sessionId });
      return {
        error: 'Session limit reached. Delete old sessions to continue.',
        code: 'SESSION_LIMIT_REACHED',
        limit: SESSION.MAX_PER_USER,
        count: finalCount - 1,
      };
    }
  }

  // Track user message metric
  chatMessagesTotal.labels('user', deploymentEnv).inc();

  // Build conversation history and get AI response
  const conversationHistory = buildConversationHistory(session.messages);
  const completion = await getCompletion(conversationHistory);

  // Save AI response to database
  session.messages.push({
    role: 'ai',
    content: completion.content,
    timestamp: new Date(),
  });

  // Update title with latest AI response
  session.title = truncateTitle(completion.content);

  await session.save();

  // Track AI message metric
  chatMessagesTotal.labels('ai', deploymentEnv).inc();

  // Track total chat duration
  const chatDurationMs =
    Number(process.hrtime.bigint() - chatStartTime) / 1_000_000;
  chatMessageDuration.labels(deploymentEnv).observe(chatDurationMs / 1000);

  return {
    response: completion.content,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Get chat history for a session
 */
export const getChatHistory = async (
  userId: string,
  sessionId: string
): Promise<ChatHistoryResponse> => {
  const session = await ChatSession.findOne({ userId, sessionId });

  if (!session) {
    return { messages: [] };
  }

  return {
    messages: session.messages.map((msg) => ({
      role: msg.role as 'user' | 'ai' | 'system',
      content: msg.content,
      timestamp: msg.timestamp,
    })),
  };
};

/**
 * Type guard for session limit error
 */
export const isSessionLimitError = (
  result: SendMessageResult
): result is SessionLimitError => {
  return 'code' in result && result.code === 'SESSION_LIMIT_REACHED';
};

/**
 * Type guard for general error
 */
export const isError = (
  result: SendMessageResult
): result is { error: string } => {
  return 'error' in result && !('code' in result);
};
