// Metrics Registry
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

// Middleware
export { metricsMiddleware } from './metrics.middleware';

// Routes
export { default as metricsRoutes } from './metrics.routes';
