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
} from './councilSessionService';

// Ranking utilities
export {
  parseRankingFromText,
  calculateAggregateRankings,
} from './councilRankingService';

// History utilities
export { buildConversationHistory } from './councilHistoryBuilder';

// Orchestration
export { processCouncilMessage } from './councilOrchestrator';

// Types (re-export for convenience)
export type {
  SSEEvent,
  AggregateRanking,
  CreateSessionResult,
  GetSessionsResult,
  GetSessionResult,
  DeleteSessionResult,
} from '../../types/council';
