export { useSessions } from "./useSessions";
export { useChat } from "./useChat";
export { useCouncilSessions } from "./useCouncilSessions";

// Legacy hook - kept for backward compatibility during migration
export { useCouncilChat } from "./useCouncilChat";

// New council hooks
export {
  useCouncilState,
  useCouncilStream,
  CouncilProvider,
  useCouncilContext,
} from "./council";
export type {
  CouncilState,
  CouncilStateActions,
  CouncilContextValue,
} from "./council";
