/**
 * Council State Layer
 *
 * Council state 관리와 streaming을 위한 React hook
 */

// State 관리
export { useCouncilState } from "./useCouncilState";
export type { CouncilState, CouncilStateActions } from "./useCouncilState";

// Stream 관리
export { useCouncilStream } from "./useCouncilStream";
export type {
  UseCouncilStreamCallbacks,
  UseCouncilStreamReturn,
} from "./useCouncilStream";

// Context provider와 consumer (원본 통합 context)
export { CouncilProvider, useCouncilContext } from "./CouncilContext";
export type { CouncilContextValue } from "./CouncilContext";

// Render 최적화를 위한 분리된 context
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

// Session context (layout 레벨 지속성을 위함)
export {
  CouncilSessionsProvider,
  useCouncilSessionsContext,
} from "./CouncilSessionsContext";
export type { CouncilSessionsContextValue } from "./CouncilSessionsContext";

// Session hook (독립적 사용을 위함)
export { useCouncilSessions } from "./useCouncilSessions";

// UI utility
export { useTitleAlert } from "./useTitleAlert";
