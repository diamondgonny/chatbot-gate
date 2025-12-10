/**
 * Shared constants for the backend application.
 * Centralizes configuration values to avoid duplication across controllers.
 */

/** Session-related constants */
export const SESSION = {
  /** Maximum number of sessions allowed per user */
  MAX_PER_USER: 50,
  /** UUID v4 pattern for session ID validation */
  ID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

/** Chat-related constants */
export const CHAT = {
  /** Maximum allowed message length in characters */
  MAX_MESSAGE_LENGTH: 4000,
  /** Number of recent messages to include in OpenAI context */
  RECENT_MESSAGES_LIMIT: 10,
} as const;

/** Gate backoff-related constants */
export const BACKOFF = {
  /** Time window for tracking failures (5 minutes) */
  FAILURE_WINDOW_MS: 5 * 60 * 1000,
  /** Number of failures before triggering backoff */
  MAX_FAILS: 5,
  /** Backoff duration in seconds */
  SECONDS: 30,
} as const;

/** Council-related constants */
export const COUNCIL = {
  /** Maximum number of council sessions allowed per user */
  MAX_SESSIONS_PER_USER: 50,
  /** Council member models (via OpenRouter) */
  MODELS: [
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-4.1',
    'google/gemini-2.5-flash',
    'x-ai/grok-4.1-fast',
  ] as const,
  /** Chairman model for final synthesis */
  CHAIRMAN_MODEL: 'openai/gpt-5.1',
  /** System prompt for council members */
  SYSTEM_PROMPT: `You are a helpful AI assistant participating in a council discussion.
Provide a complete, comprehensive answer in a single response.
Do not ask follow-up questions or break your response into multiple parts.
Answer fully and directly.`,
  /** Maximum allowed message length in characters */
  MAX_MESSAGE_LENGTH: 4000,
  /** Number of recent messages to include in context */
  RECENT_MESSAGES_LIMIT: 5,
  /** API request timeout in milliseconds */
  API_TIMEOUT_MS: 60000,
  /** Max tokens for council member responses */
  MAX_TOKENS: 8192,
  /** Max tokens for chairman synthesis (higher for comprehensive answer) */
  CHAIRMAN_MAX_TOKENS: 16384,
} as const;
