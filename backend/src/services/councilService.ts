/**
 * Council Service
 * Re-exports from refactored council modules for backward compatibility.
 *
 * @deprecated Import directly from './council' instead.
 * This file will be removed in a future version.
 */

// Re-export types from types/council.ts
export type {
  SSEEvent,
  AggregateRanking,
  CreateSessionResult,
  GetSessionsResult,
  GetSessionResult,
  DeleteSessionResult,
} from '../types/council';

// Re-export session functions from councilSessionService
export {
  validateSessionId,
  validateMessage,
  createSession,
  getSessions,
  getSession,
  deleteSession,
  isSessionLimitError,
} from './council/councilSessionService';

// Re-export ranking functions
export {
  parseRankingFromText,
  calculateAggregateRankings,
} from './council/councilRankingService';

// Re-export history builder
export { buildConversationHistory } from './council/councilHistoryBuilder';

// Re-export orchestrator
export { processCouncilMessage } from './council/councilOrchestrator';
