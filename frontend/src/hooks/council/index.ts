/**
 * @deprecated Import from @/features/council instead
 *
 * Council Hooks Layer - Re-exports for backward compatibility
 */

// State management
export { useCouncilState } from "@/features/council/state";
export type { CouncilState, CouncilStateActions } from "@/features/council/state";

// Stream management
export { useCouncilStream } from "@/features/council/state";
export type {
  UseCouncilStreamCallbacks,
  UseCouncilStreamReturn,
} from "@/features/council/state";

// Context provider and consumer
export { CouncilProvider, useCouncilContext } from "@/features/council/state";
export type { CouncilContextValue } from "@/features/council/state";
