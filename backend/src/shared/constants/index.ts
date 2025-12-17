/**
 * 백엔드 애플리케이션 공유 상수
 * 컨트롤러 전반에 걸쳐 중복을 피하기 위한 설정 값 중앙화
 */

/** 세션 관련 상수 */
export const SESSION = {
  MAX_PER_USER: 300,
  ID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

/** 채팅 관련 상수 */
export const CHAT = {
  MAX_MESSAGE_LENGTH: 4000,
  RECENT_MESSAGES_LIMIT: 10,
} as const;

/** Gate backoff 관련 상수 */
export const BACKOFF = {
  FAILURE_WINDOW_MS: 5 * 60 * 1000,
  MAX_FAILS: 5,
  SECONDS: 30,
} as const;

/** Council 모드 타입 */
export type CouncilMode = 'lite' | 'ultra';

/** Council 관련 상수 */
export const COUNCIL = {
  MAX_SESSIONS_PER_USER: 300,

  /** 운영 안정성을 위한 SSE(Server-Sent Events) 제한 */
  SSE: {
    MAX_CONCURRENT_SESSIONS: 100,
    GRACE_PERIOD_MS: 30 * 1000,
    STALE_THRESHOLD_MS: 10 * 60 * 1000,
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    /** SSE 연결 유지를 위한 heartbeat 간격 (ms) - proxy/tunnel timeout 방지 */
    HEARTBEAT_INTERVAL_MS: 15 * 1000,
  },
  /** Ultra council 멤버 모델 (OpenRouter 경유) */
  ULTRA_MODELS: [
    'anthropic/claude-opus-4.5',
    'openai/gpt-5.2',
    'google/gemini-3-pro-preview',
    'x-ai/grok-4',
    'deepseek/deepseek-v3.2-speciale'
  ] as const,
  /** Lite council 멤버 모델 (OpenRouter 경유) */
  LITE_MODELS: [
    'anthropic/claude-haiku-4.5',
    'openai/gpt-5-mini',
    'google/gemini-2.5-flash',
    'moonshotai/kimi-k2-0905',
    'deepseek/deepseek-v3.2'
  ] as const,
  /** 최종 종합을 위한 Ultra chairman 모델 */
  ULTRA_CHAIRMAN_MODEL: 'google/gemini-3-pro-preview',
  /** 최종 종합을 위한 Lite chairman 모델 */
  LITE_CHAIRMAN_MODEL: 'google/gemini-2.5-flash',
  /** Council 멤버용 system prompt */
  SYSTEM_PROMPT: `You are a helpful AI assistant participating in a council discussion.
Provide a complete, comprehensive answer in a single response.
Do not ask follow-up questions or break your response into multiple parts.
Answer fully and directly.`,
  MAX_MESSAGE_LENGTH: 4000,
  RECENT_MESSAGES_LIMIT: 5,
  STAGE1_TIMEOUT_MS: 180000,
  STAGE2_TIMEOUT_MS: 180000,
  STAGE3_TIMEOUT_MS: 300000,
  MAX_TOKENS: 8192,
  /** Chairman 종합용 최대 토큰 수 (포괄적 답변을 위해 더 높게 설정) */
  CHAIRMAN_MAX_TOKENS: 16384,
} as const;

/** 주어진 모드에 대한 council 멤버 모델 반환 */
export function getModelsForMode(mode: CouncilMode): readonly string[] {
  return mode === 'ultra' ? COUNCIL.ULTRA_MODELS : COUNCIL.LITE_MODELS;
}

/** 주어진 모드에 대한 chairman 모델 반환 */
export function getChairmanForMode(mode: CouncilMode): string {
  return mode === 'ultra' ? COUNCIL.ULTRA_CHAIRMAN_MODEL : COUNCIL.LITE_CHAIRMAN_MODEL;
}
