/**
 * Council Types
 * Type definitions for Council SSE events and service results.
 */

import {
  ICouncilSession,
  IStage1Response,
  IStage2Review,
  IStage3Synthesis,
} from '../models/councilSession.model';

// Aggregate ranking result from Stage 2
export interface AggregateRanking {
  model: string;
  averageRank: number;
  rankingsCount: number;
}

// SSE Event types for real-time streaming
export type SSEEvent =
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'stage1_start' }
  | { type: 'stage1_chunk'; model: string; delta: string }
  | { type: 'stage1_model_complete'; model: string; responseTimeMs: number; promptTokens?: number; completionTokens?: number }
  | { type: 'stage1_response'; data: IStage1Response }
  | { type: 'stage1_complete' }
  | { type: 'stage2_start' }
  | { type: 'stage2_chunk'; model: string; delta: string }
  | { type: 'stage2_model_complete'; model: string; responseTimeMs: number; promptTokens?: number; completionTokens?: number }
  | { type: 'stage2_response'; data: IStage2Review }
  | { type: 'stage2_complete'; data: { labelToModel: Record<string, string>; aggregateRankings: AggregateRanking[] } }
  | { type: 'stage3_start' }
  | { type: 'stage3_reasoning_chunk'; delta: string }
  | { type: 'stage3_chunk'; delta: string }
  | { type: 'stage3_response'; data: IStage3Synthesis }
  | { type: 'title_complete'; data: { title: string } }
  | { type: 'complete' }
  | { type: 'error'; error: string };

// Session service result types (discriminated unions)
export type CreateSessionResult =
  | { success: true; session: ICouncilSession }
  | { success: false; error: string; code: string };

export type GetSessionsResult =
  | { success: true; sessions: ICouncilSession[] }
  | { success: false; error: string };

export type GetSessionResult =
  | { success: true; session: ICouncilSession }
  | { success: false; error: string };

export type DeleteSessionResult =
  | { success: true }
  | { success: false; error: string };
