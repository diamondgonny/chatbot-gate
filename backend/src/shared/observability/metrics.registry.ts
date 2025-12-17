import client, { Registry, Counter, Histogram, Gauge } from 'prom-client';

// 커스텀 레지스트리 생성
export const register = new Registry();

// 배포 환경 가져오기 헬퍼
export const getDeploymentEnv = (): string => {
  return process.env.DEPLOYMENT_ENV || 'unknown';
};

// 기본 Node.js 메트릭 추가 (메모리, CPU, event loop, GC 등)
// 테스트 환경에서는 interval 누적을 피하기 위해 비활성화
// 참고: prom-client v15는 내부적으로 public API로 중단할 수 없는 interval 타이머를 생성
// register.clear()는 메트릭만 제거하고 내부 타이머는 제거하지 않음
if (process.env.NODE_ENV !== 'test') {
  client.collectDefaultMetrics({
    register,
    prefix: 'chatbot_gate_',
    labels: { deployment_env: getDeploymentEnv() },
  });
}

/**
 * 메트릭 수집 중지 및 레지스트리 정리 (graceful shutdown용)
 * 참고: prom-client v15는 stop 함수를 제공하지 않으므로 레지스트리만 정리
 */
export const stopMetricsCollection = (): void => {
  register.clear();
};

// ============================================
// HTTP 메트릭
// ============================================

export const httpRequestsTotal = new Counter({
  name: 'chatbot_gate_http_requests_total',
  help: 'HTTP 요청 총 수',
  labelNames: ['method', 'route', 'status_code', 'deployment_env'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'chatbot_gate_http_request_duration_seconds',
  help: 'HTTP 요청 소요 시간 (초)',
  labelNames: ['method', 'route', 'status_code', 'deployment_env'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestsInProgress = new Gauge({
  name: 'chatbot_gate_http_requests_in_progress',
  help: '현재 처리 중인 HTTP 요청 수',
  labelNames: ['method', 'route', 'deployment_env'],
  registers: [register],
});

// ============================================
// 비즈니스 메트릭 - Gate 인증
// ============================================

export const gateAuthAttempts = new Counter({
  name: 'chatbot_gate_auth_attempts_total',
  help: 'Gate 인증 시도 총 수',
  labelNames: ['result', 'deployment_env'], // result: success, failure, backoff
  registers: [register],
});

// ============================================
// 비즈니스 메트릭 - 채팅
// ============================================

export const chatMessagesTotal = new Counter({
  name: 'chatbot_gate_chat_messages_total',
  help: '처리된 채팅 메시지 총 수',
  labelNames: ['direction', 'deployment_env'], // direction: user, ai
  registers: [register],
});

export const chatMessageDuration = new Histogram({
  name: 'chatbot_gate_chat_message_duration_seconds',
  help: '채팅 메시지 처리 시간 (OpenAI API 호출 포함)',
  labelNames: ['deployment_env'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

// ============================================
// 비즈니스 메트릭 - 세션
// ============================================

export const activeSessions = new Gauge({
  name: 'chatbot_gate_active_sessions',
  help: '활성 채팅 세션 수 (샘플링)',
  labelNames: ['deployment_env'],
  registers: [register],
});

export const sessionOperations = new Counter({
  name: 'chatbot_gate_session_operations_total',
  help: '세션 작업 총 수',
  labelNames: ['operation', 'deployment_env'], // operation: create, delete, fetch
  registers: [register],
});

// ============================================
// 인프라 메트릭 - MongoDB
// ============================================

export const mongoConnectionState = new Gauge({
  name: 'chatbot_gate_mongodb_connection_state',
  help: 'MongoDB 연결 상태 (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)',
  labelNames: ['deployment_env'],
  registers: [register],
});

// ============================================
// 인프라 메트릭 - OpenAI API
// ============================================

export const openaiApiCalls = new Counter({
  name: 'chatbot_gate_openai_api_calls_total',
  help: 'OpenAI API 호출 총 수',
  labelNames: ['status', 'deployment_env'], // status: success, error
  registers: [register],
});

export const openaiApiDuration = new Histogram({
  name: 'chatbot_gate_openai_api_duration_seconds',
  help: 'OpenAI API 호출 소요 시간 (초)',
  labelNames: ['result', 'deployment_env'], // result: success, error
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

export const openaiTokensUsed = new Counter({
  name: 'chatbot_gate_openai_tokens_total',
  help: '사용된 OpenAI 토큰 총 수',
  labelNames: ['type', 'deployment_env'], // type: prompt, completion
  registers: [register],
});

// ============================================
// 인프라 메트릭 - Rate Limiting
// ============================================

export const rateLimitHits = new Counter({
  name: 'chatbot_gate_rate_limit_hits_total',
  help: 'Rate limit 도달 총 수 (429 응답)',
  labelNames: ['route', 'deployment_env'],
  registers: [register],
});

// ============================================
// 비즈니스 메트릭 - AI Council
// ============================================

export const councilMessagesTotal = new Counter({
  name: 'chatbot_gate_council_messages_total',
  help: '처리된 council 메시지 총 수',
  labelNames: ['direction', 'deployment_env'], // direction: user, ai
  registers: [register],
});

export const councilSessionsTotal = new Counter({
  name: 'chatbot_gate_council_sessions_total',
  help: 'Council 세션 작업 총 수',
  labelNames: ['operation', 'deployment_env'], // operation: create, delete
  registers: [register],
});

export const councilStageDuration = new Histogram({
  name: 'chatbot_gate_council_stage_duration_seconds',
  help: 'Council 단계 처리 소요 시간 (초)',
  labelNames: ['stage', 'deployment_env'], // stage: 1, 2, 3
  buckets: [5, 15, 30, 60, 120, 300],
  registers: [register],
});

export const councilSseConnections = new Gauge({
  name: 'chatbot_gate_council_sse_connections',
  help: '활성 council SSE 연결 수',
  labelNames: ['deployment_env'],
  registers: [register],
});

export const councilAbortsTotal = new Counter({
  name: 'chatbot_gate_council_aborts_total',
  help: 'Council 처리 중단 총 수',
  labelNames: ['stage', 'deployment_env'], // stage: 1, 2, 3, unknown
  registers: [register],
});

// ============================================
// 인프라 메트릭 - OpenRouter API
// ============================================

export const openrouterApiCalls = new Counter({
  name: 'chatbot_gate_openrouter_api_calls_total',
  help: 'OpenRouter API 호출 총 수',
  labelNames: ['model', 'stage', 'status', 'deployment_env'], // status: success, error
  registers: [register],
});

export const openrouterResponseTime = new Histogram({
  name: 'chatbot_gate_openrouter_response_time_seconds',
  help: 'OpenRouter API 응답 시간 (초)',
  labelNames: ['model', 'stage', 'deployment_env'],
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [register],
});

export const openrouterTokensUsed = new Counter({
  name: 'chatbot_gate_openrouter_tokens_total',
  help: '사용된 OpenRouter 토큰 총 수',
  labelNames: ['model', 'stage', 'type', 'deployment_env'], // type: prompt, completion, reasoning
  registers: [register],
});
