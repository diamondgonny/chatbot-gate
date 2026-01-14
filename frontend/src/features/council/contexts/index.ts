/**
 * Council Contexts
 *
 * Council feature를 위한 React Context provider와 consumer
 */

// 통합 context (기본 API)
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
