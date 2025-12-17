/**
 * Council Types
 *
 * Council feature를 위한 타입 정의
 */

// API/External type (council.types.ts에서)
export type {
  CouncilMode,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  CouncilUserMessage,
  CouncilAssistantMessage,
  CouncilMessage,
  CouncilSession,
  CouncilSessionDetail,
  AggregateRanking,
  SSEEventType,
  Stage1ChunkEvent,
  Stage1ModelCompleteEvent,
  SSEEvent,
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "./council.types";

// Domain type (types.ts에서)
export type { CurrentStage, ModelMapping, ComputedMessageData, StreamState } from "./types";
export { createInitialStreamState } from "./types";
