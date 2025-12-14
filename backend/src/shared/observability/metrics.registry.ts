import client, { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Helper to get deployment environment
export const getDeploymentEnv = (): string => {
  return process.env.DEPLOYMENT_ENV || 'unknown';
};

// Add default Node.js metrics (memory, CPU, event loop, GC, etc.)
// Note: prom-client v15 internally creates an interval timer that cannot be stopped
// via public API. register.clear() only removes metrics, not the internal timer.
// This is acceptable because:
// 1. In production, the process runs indefinitely
// 2. In tests, the timer doesn't block process exit (vitest handles this gracefully)
// 3. The overhead is minimal (10s interval for metric collection)
client.collectDefaultMetrics({
  register,
  prefix: 'chatbot_gate_',
  labels: { deployment_env: getDeploymentEnv() },
});

/**
 * Stop metrics collection and clear registry (for graceful shutdown)
 * Note: prom-client v15 doesn't expose a stop function, so we clear the registry
 */
export const stopMetricsCollection = (): void => {
  register.clear();
};

// ============================================
// HTTP Metrics
// ============================================

export const httpRequestsTotal = new Counter({
  name: 'chatbot_gate_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'deployment_env'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'chatbot_gate_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'deployment_env'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestsInProgress = new Gauge({
  name: 'chatbot_gate_http_requests_in_progress',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'route', 'deployment_env'],
  registers: [register],
});

// ============================================
// Business Metrics - Gate Authentication
// ============================================

export const gateAuthAttempts = new Counter({
  name: 'chatbot_gate_auth_attempts_total',
  help: 'Total gate authentication attempts',
  labelNames: ['result', 'deployment_env'], // result: success, failure, backoff
  registers: [register],
});

// ============================================
// Business Metrics - Chat
// ============================================

export const chatMessagesTotal = new Counter({
  name: 'chatbot_gate_chat_messages_total',
  help: 'Total chat messages processed',
  labelNames: ['direction', 'deployment_env'], // direction: user, ai
  registers: [register],
});

export const chatMessageDuration = new Histogram({
  name: 'chatbot_gate_chat_message_duration_seconds',
  help: 'Time to process chat message (including OpenAI API call)',
  labelNames: ['deployment_env'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

// ============================================
// Business Metrics - Sessions
// ============================================

export const activeSessions = new Gauge({
  name: 'chatbot_gate_active_sessions',
  help: 'Number of active chat sessions (sampled)',
  labelNames: ['deployment_env'],
  registers: [register],
});

export const sessionOperations = new Counter({
  name: 'chatbot_gate_session_operations_total',
  help: 'Total session operations',
  labelNames: ['operation', 'deployment_env'], // operation: create, delete, fetch
  registers: [register],
});

// ============================================
// Infrastructure Metrics - MongoDB
// ============================================

export const mongoConnectionState = new Gauge({
  name: 'chatbot_gate_mongodb_connection_state',
  help: 'MongoDB connection state (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)',
  labelNames: ['deployment_env'],
  registers: [register],
});

// ============================================
// Infrastructure Metrics - OpenAI API
// ============================================

export const openaiApiCalls = new Counter({
  name: 'chatbot_gate_openai_api_calls_total',
  help: 'Total OpenAI API calls',
  labelNames: ['status', 'deployment_env'], // status: success, error
  registers: [register],
});

export const openaiApiDuration = new Histogram({
  name: 'chatbot_gate_openai_api_duration_seconds',
  help: 'OpenAI API call duration in seconds',
  labelNames: ['result', 'deployment_env'], // result: success, error
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

export const openaiTokensUsed = new Counter({
  name: 'chatbot_gate_openai_tokens_total',
  help: 'Total OpenAI tokens used',
  labelNames: ['type', 'deployment_env'], // type: prompt, completion
  registers: [register],
});

// ============================================
// Infrastructure Metrics - Rate Limiting
// ============================================

export const rateLimitHits = new Counter({
  name: 'chatbot_gate_rate_limit_hits_total',
  help: 'Total rate limit hits (429 responses)',
  labelNames: ['route', 'deployment_env'],
  registers: [register],
});

// ============================================
// Business Metrics - AI Council
// ============================================

export const councilMessagesTotal = new Counter({
  name: 'chatbot_gate_council_messages_total',
  help: 'Total council messages processed',
  labelNames: ['direction', 'deployment_env'], // direction: user, ai
  registers: [register],
});

export const councilSessionsTotal = new Counter({
  name: 'chatbot_gate_council_sessions_total',
  help: 'Total council session operations',
  labelNames: ['operation', 'deployment_env'], // operation: create, delete
  registers: [register],
});

export const councilStageDuration = new Histogram({
  name: 'chatbot_gate_council_stage_duration_seconds',
  help: 'Council stage processing duration in seconds',
  labelNames: ['stage', 'deployment_env'], // stage: 1, 2, 3
  buckets: [5, 15, 30, 60, 120, 300],
  registers: [register],
});

export const councilSseConnections = new Gauge({
  name: 'chatbot_gate_council_sse_connections',
  help: 'Number of active council SSE connections',
  labelNames: ['deployment_env'],
  registers: [register],
});

export const councilAbortsTotal = new Counter({
  name: 'chatbot_gate_council_aborts_total',
  help: 'Total council processing aborts',
  labelNames: ['stage', 'deployment_env'], // stage: 1, 2, 3, unknown
  registers: [register],
});

// ============================================
// Infrastructure Metrics - OpenRouter API
// ============================================

export const openrouterApiCalls = new Counter({
  name: 'chatbot_gate_openrouter_api_calls_total',
  help: 'Total OpenRouter API calls',
  labelNames: ['model', 'stage', 'status', 'deployment_env'], // status: success, error
  registers: [register],
});

export const openrouterResponseTime = new Histogram({
  name: 'chatbot_gate_openrouter_response_time_seconds',
  help: 'OpenRouter API response time in seconds',
  labelNames: ['model', 'stage', 'deployment_env'],
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [register],
});

export const openrouterTokensUsed = new Counter({
  name: 'chatbot_gate_openrouter_tokens_total',
  help: 'Total OpenRouter tokens used',
  labelNames: ['model', 'stage', 'type', 'deployment_env'], // type: prompt, completion, reasoning
  registers: [register],
});
