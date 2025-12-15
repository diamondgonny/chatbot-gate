/**
 * Shared constants for the backend application.
 * Centralizes configuration values to avoid duplication across controllers.
 */

/** Session-related constants */
export const SESSION = {
  /** Maximum number of sessions allowed per user */
  MAX_PER_USER: 300,
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

/** Council mode type */
export type CouncilMode = 'lite' | 'ultra';

/** Council-related constants */
export const COUNCIL = {
  /** Maximum number of council sessions allowed per user */
  MAX_SESSIONS_PER_USER: 300,

  /** SSE (Server-Sent Events) limits for operational stability */
  SSE: {
    /** Maximum concurrent processing sessions (memory guard) */
    MAX_CONCURRENT_SESSIONS: 100,
    /** Grace period before aborting disconnected client (ms) */
    GRACE_PERIOD_MS: 30 * 1000,
    /** Stale session threshold for cleanup (ms) */
    STALE_THRESHOLD_MS: 10 * 60 * 1000,
    /** Cleanup interval for stale sessions (ms) */
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
  },
  /** Ultra council member models (via OpenRouter) */
  ULTRA_MODELS: [
    'anthropic/claude-opus-4.5',
    'openai/gpt-5.1',
    'google/gemini-3-pro-preview',
    'x-ai/grok-4',
    'deepseek/deepseek-v3.2-speciale'
  ] as const,
  /** Lite council member models (via OpenRouter) */
  LITE_MODELS: [
    'anthropic/claude-haiku-4.5',
    'openai/gpt-5-mini',
    'google/gemini-2.5-flash',
    'moonshotai/kimi-k2-0905',
    'deepseek/deepseek-v3.2'
  ] as const,
  /** Ultra chairman model for final synthesis */
  ULTRA_CHAIRMAN_MODEL: 'google/gemini-3-pro-preview',
  /** Lite chairman model for final synthesis */
  LITE_CHAIRMAN_MODEL: 'google/gemini-2.5-flash',
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

/** Get council member models for a given mode */
export function getModelsForMode(mode: CouncilMode): readonly string[] {
  return mode === 'ultra' ? COUNCIL.ULTRA_MODELS : COUNCIL.LITE_MODELS;
}

/** Get chairman model for a given mode */
export function getChairmanForMode(mode: CouncilMode): string {
  return mode === 'ultra' ? COUNCIL.ULTRA_CHAIRMAN_MODEL : COUNCIL.LITE_CHAIRMAN_MODEL;
}
