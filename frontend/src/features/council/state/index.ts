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

// Context provider and consumer
export { CouncilProvider, useCouncilContext } from "./CouncilContext";
export type { CouncilContextValue } from "./CouncilContext";

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
