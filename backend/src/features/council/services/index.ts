/**
 * Council Services
 * Barrel export for council-related services.
 */

// Session management
export {
  validateSessionId,
  validateMessage,
  createSession,
  getSessions,
  getSession,
  deleteSession,
  isSessionLimitError,
} from './session.service';

// Ranking utilities
export {
  parseRankingFromText,
  calculateAggregateRankings,
} from './ranking.service';

// History utilities
export { buildConversationHistory } from './history.service';

// Orchestration
export { processCouncilMessage } from './orchestrator.service';

// Title generation
export { generateTitle } from './title.service';

// Persistence
export { saveAbortedMessage, saveCompleteMessage } from './persistence.service';

// Council API (OpenRouter multi-model)
export {
  queryCouncilModels,
  queryChairman,
  queryCouncilModelsStreaming,
  chatCompletionStreamWithReasoning,
  type ModelResponse,
  type ModelStreamChunk,
  type ModelStreamComplete,
  type ModelStreamEvent,
} from './councilApi.service';
