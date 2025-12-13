/**
 * Observability (Cross-cutting Concern)
 * Metrics registry and related utilities.
 */

export {
  register,
  getDeploymentEnv,
  stopMetricsCollection,
  // HTTP Metrics
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsInProgress,
  // Business Metrics - Gate
  gateAuthAttempts,
  // Business Metrics - Chat
  chatMessagesTotal,
  chatMessageDuration,
  // Business Metrics - Sessions
  activeSessions,
  sessionOperations,
  // Infrastructure Metrics - MongoDB
  mongoConnectionState,
  // Infrastructure Metrics - OpenAI
  openaiApiCalls,
  openaiApiDuration,
  openaiTokensUsed,
  // Infrastructure Metrics - Rate Limiting
  rateLimitHits,
  // Business Metrics - Council
  councilMessagesTotal,
  councilSessionsTotal,
  councilStageDuration,
  councilSseConnections,
  councilAbortsTotal,
  // Infrastructure Metrics - OpenRouter
  openrouterApiCalls,
  openrouterResponseTime,
  openrouterTokensUsed,
} from './metrics.registry';
