/**
 * Council Service Layer
 *
 * Handles API communication and stream processing for the Council feature.
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
} from "./councilApi";

// Stream client
export { streamSSE, reconnectSSE, StreamError } from "./streamClient";

// Stream event processor
export { StreamEventProcessor } from "./streamEventProcessor";
export type {
  StreamEventCallbacks,
  StreamEventProcessorOptions,
} from "./streamEventProcessor";
