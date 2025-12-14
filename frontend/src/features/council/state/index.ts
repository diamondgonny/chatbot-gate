/**
 * Council State Layer
 *
 * React hooks for council state management and streaming.
 */

// State management
export { useCouncilState } from "./useCouncilState";
export type { CouncilState, CouncilStateActions } from "./useCouncilState";

// Stream management
export { useCouncilStream } from "./useCouncilStream";
export type {
  UseCouncilStreamCallbacks,
  UseCouncilStreamReturn,
} from "./useCouncilStream";

// Context provider and consumer (original combined context)
export { CouncilProvider, useCouncilContext } from "./CouncilContext";
export type { CouncilContextValue } from "./CouncilContext";

// Split contexts for render optimization
export {
  CouncilMessagesProvider,
  useCouncilMessagesContext,
} from "./CouncilMessagesContext";
export type { CouncilMessagesContextValue } from "./CouncilMessagesContext";

export {
  CouncilStreamProvider,
  useCouncilStreamContext,
} from "./CouncilStreamContext";
export type { CouncilStreamContextValue } from "./CouncilStreamContext";

export {
  CouncilStatusProvider,
  useCouncilStatusContext,
} from "./CouncilStatusContext";
export type { CouncilStatusContextValue } from "./CouncilStatusContext";

// Sessions context (for layout-level persistence)
export {
  CouncilSessionsProvider,
  useCouncilSessionsContext,
} from "./CouncilSessionsContext";
export type { CouncilSessionsContextValue } from "./CouncilSessionsContext";

// Sessions hook (for standalone usage)
export { useCouncilSessions } from "./useCouncilSessions";

// UI utilities
export { useTitleAlert } from "./useTitleAlert";
