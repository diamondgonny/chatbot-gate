/**
 * Message Service
 * Orchestrates chat message flow: session management, message storage, AI response.
 */

import {
  ChatSession,
  chatMessagesTotal,
  chatMessageDuration,
  getDeploymentEnv,
} from '@shared';
import type { ChatMessageResponse, ChatHistoryResponse, SessionLimitError } from '@shared';
import { getCompletion, buildConversationHistory } from './openai.service';
import { findOrCreateSession } from './session.service';
import { isSessionLimitError } from './validation.service';

/**
 * Truncate text to specified length with ellipsis
 */
const truncateTitle = (text: string, maxLength = 50): string =>
  text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

export type SendMessageResult =
  | ChatMessageResponse
  | SessionLimitError
  | { error: string };

/**
 * Send a message and get AI response
 * Orchestrates: session lookup/creation, message storage, AI interaction
 */
export const sendMessage = async (
  userId: string,
  sessionId: string,
  message: string
): Promise<SendMessageResult> => {
  const chatStartTime = process.hrtime.bigint();
  const deploymentEnv = getDeploymentEnv();

  // Find or create session (with limit check)
  const result = await findOrCreateSession(userId, sessionId);
  if (isSessionLimitError(result)) {
    return result;
  }

  const { session } = result;

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
