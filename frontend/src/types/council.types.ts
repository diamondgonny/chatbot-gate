/**
 * @deprecated Import from @/features/council instead
 *
 * Council Types - Re-exports for backward compatibility
 */

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
} from "@/features/council/domain";
