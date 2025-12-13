/**
 * Chat Service
 * Handles chat message processing, OpenAI communication, and session management.
 */

import OpenAI from 'openai';
import { config, ChatSession, SESSION, CHAT } from '../../shared';
import type { ChatMessageResponse, ChatHistoryResponse, SessionLimitError } from '../../shared';
import {
  chatMessagesTotal,
  chatMessageDuration,
  openaiApiCalls,
  openaiApiDuration,
  openaiTokensUsed,
  getDeploymentEnv,
} from '../metrics/metrics.registry';

// System Prompt: Defines the persona of the AI
const SYSTEM_PROMPT = `
You are a playful, witty, and friendly AI chatbot living in a secret digital gate.
Your persona is similar to "SimSimi".
- You speak in a casual, conversational tone (Banmal/Informal Korean is preferred if the user speaks Korean).
- You are not a boring assistant. You have opinions and feelings.
- You don't use emojis. You prefer plain text responses.
- You are curious about the human world.
- Keep responses relatively short and engaging, like a real chat message.
`;

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

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

/**
 * Check if OpenAI API key is configured
 */
export const isOpenAIConfigured = (): boolean => {
  return !!config.openaiApiKey;
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

  // Build conversation history for OpenAI
  const recentMessages = session.messages
    .slice(-CHAT.RECENT_MESSAGES_LIMIT)
    .map((msg) => ({
      role: (msg.role === 'ai' ? 'assistant' : msg.role) as
        | 'user'
        | 'assistant'
        | 'system',
      content: msg.content,
    }));

  // Get response from OpenAI
  const openaiStartTime = process.hrtime.bigint();
  let completion;

  try {
    completion = await openai.chat.completions.create({
      model: config.modelName,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...recentMessages],
    });

    // Track OpenAI API success metrics
    const openaiDurationMs =
      Number(process.hrtime.bigint() - openaiStartTime) / 1_000_000;
    openaiApiCalls.labels('success', deploymentEnv).inc();
    openaiApiDuration
      .labels('success', deploymentEnv)
      .observe(openaiDurationMs / 1000);

    // Track token usage if available
    if (completion.usage) {
      openaiTokensUsed
        .labels('prompt', deploymentEnv)
        .inc(completion.usage.prompt_tokens);
      openaiTokensUsed
        .labels('completion', deploymentEnv)
        .inc(completion.usage.completion_tokens);
    }
  } catch (openaiError) {
    // Track OpenAI API failure metrics
    const openaiDurationMs =
      Number(process.hrtime.bigint() - openaiStartTime) / 1_000_000;
    openaiApiCalls.labels('error', deploymentEnv).inc();
    openaiApiDuration
      .labels('error', deploymentEnv)
      .observe(openaiDurationMs / 1000);
    throw openaiError;
  }

  const aiResponse = completion.choices[0].message.content || '';

  // Save AI response to database
  session.messages.push({
    role: 'ai',
    content: aiResponse,
    timestamp: new Date(),
  });

  // Update title with latest AI response
  session.title = truncateTitle(aiResponse);

  await session.save();

  // Track AI message metric
  chatMessagesTotal.labels('ai', deploymentEnv).inc();

  // Track total chat duration
  const chatDurationMs =
    Number(process.hrtime.bigint() - chatStartTime) / 1_000_000;
  chatMessageDuration.labels(deploymentEnv).observe(chatDurationMs / 1000);

  return {
    response: aiResponse,
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
