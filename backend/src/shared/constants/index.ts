/**
 * 백엔드 애플리케이션 공유 상수
 * 컨트롤러 전반에 걸쳐 중복을 피하기 위한 설정 값 중앙화
 */

/** 세션 관련 상수 */
export const SESSION = {
  /** 사용자당 허용되는 최대 세션 수 */
  MAX_PER_USER: 300,
  /** 세션 ID 검증을 위한 UUID v4 패턴 */
  ID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

/** 채팅 관련 상수 */
export const CHAT = {
  /** 허용되는 최대 메시지 길이 (문자 수) */
  MAX_MESSAGE_LENGTH: 4000,
  /** OpenAI context에 포함할 최근 메시지 수 */
  RECENT_MESSAGES_LIMIT: 10,
} as const;

/** Gate backoff 관련 상수 */
export const BACKOFF = {
  /** 실패 추적 시간 윈도우 (5분) */
  FAILURE_WINDOW_MS: 5 * 60 * 1000,
  /** backoff를 트리거하기 전 실패 횟수 */
  MAX_FAILS: 5,
  /** Backoff 지속 시간 (초) */
  SECONDS: 30,
} as const;

/** Council 모드 타입 */
export type CouncilMode = 'lite' | 'ultra';

/** Council 관련 상수 */
export const COUNCIL = {
  /** 사용자당 허용되는 최대 council 세션 수 */
  MAX_SESSIONS_PER_USER: 300,

  /** 운영 안정성을 위한 SSE(Server-Sent Events) 제한 */
  SSE: {
    /** 최대 동시 처리 세션 수 (메모리 가드) */
    MAX_CONCURRENT_SESSIONS: 100,
    /** 연결 끊긴 클라이언트를 중단하기 전 유예 기간 (ms) */
    GRACE_PERIOD_MS: 30 * 1000,
    /** 정리 대상 오래된 세션 임계값 (ms) */
    STALE_THRESHOLD_MS: 10 * 60 * 1000,
    /** 오래된 세션 정리 주기 (ms) */
    CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
    /** SSE 연결 유지를 위한 heartbeat 간격 (ms) - proxy/tunnel timeout 방지 */
    HEARTBEAT_INTERVAL_MS: 15 * 1000,
  },
  /** Ultra council 멤버 모델 (OpenRouter 경유) */
  ULTRA_MODELS: [
    'anthropic/claude-opus-4.5',
    'openai/gpt-5.1',
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
  /** 허용되는 최대 메시지 길이 (문자 수) */
  MAX_MESSAGE_LENGTH: 4000,
  /** Context에 포함할 최근 메시지 수 */
  RECENT_MESSAGES_LIMIT: 5,
  /** Stage 1 API timeout (개별 응답) - 3분 */
  STAGE1_TIMEOUT_MS: 180000,
  /** Stage 2 API timeout (상호 평가) - 3분 */
  STAGE2_TIMEOUT_MS: 180000,
  /** Stage 3 API timeout (chairman 종합) - 5분 */
  STAGE3_TIMEOUT_MS: 300000,
  /** Council 멤버 응답용 최대 토큰 수 */
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
