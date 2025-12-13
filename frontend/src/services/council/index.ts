/**
 * @deprecated Import from @/features/council instead
 *
 * Council Service Layer - Re-exports for backward compatibility
 */

// API functions
export {
  createCouncilSession,
  getCouncilSessions,
  getCouncilSession,
  deleteCouncilSession,
  getProcessingStatus,
  abortCouncilProcessing,
  getCouncilMessageUrl,
  getReconnectUrl,
} from "@/features/council/services";

// Stream client
export { streamSSE, reconnectSSE, StreamError } from "@/features/council/services";

// Stream event processor
export { StreamEventProcessor } from "@/features/council/services";
export type {
  StreamEventCallbacks,
  StreamEventProcessorOptions,
} from "@/features/council/services";
