/**
 * 관찰성 (횡단 관심사)
 * 메트릭 레지스트리 및 관련 유틸리티
 */

export {
  register,
  getDeploymentEnv,
  stopMetricsCollection,
  // HTTP 메트릭
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsInProgress,
  // 비즈니스 메트릭 - Gate
  gateAuthAttempts,
  // 비즈니스 메트릭 - 채팅
  chatMessagesTotal,
  chatMessageDuration,
  // 비즈니스 메트릭 - 세션
  activeSessions,
  sessionOperations,
  // 인프라 메트릭 - MongoDB
  mongoConnectionState,
  // 인프라 메트릭 - OpenAI
  openaiApiCalls,
  openaiApiDuration,
  openaiTokensUsed,
  // 인프라 메트릭 - Rate Limiting
  rateLimitHits,
  // 비즈니스 메트릭 - Council
  councilMessagesTotal,
  councilSessionsTotal,
  councilStageDuration,
  councilSseConnections,
  councilAbortsTotal,
  // 인프라 메트릭 - OpenRouter
  openrouterApiCalls,
  openrouterResponseTime,
  openrouterTokensUsed,
} from './metrics.registry';
