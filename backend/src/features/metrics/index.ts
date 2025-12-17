// 하위 호환성을 위해 shared/observability에서 재export
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
  // 비즈니스 메트릭 - Chat
  chatMessagesTotal,
  chatMessageDuration,
  // 비즈니스 메트릭 - Sessions
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
} from '@shared/observability';

// 미들웨어
export { metricsMiddleware } from './middleware/metrics.middleware';

// 라우트
export { default as metricsRoutes } from './routes/metrics.routes';
