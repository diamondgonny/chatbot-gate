/**
 * Council Service
 * Handles 3-stage LLM Council orchestration, session management, and SSE streaming.
 */

import { randomUUID } from 'crypto';
import {
  CouncilSession,
  ICouncilSession,
  IStage1Response,
  IStage2Review,
  IStage3Synthesis,
  ICouncilMessage,
} from '../models/CouncilSession';
import {
  queryCouncilModels,
  queryChairman,
  chatCompletion,
  OpenRouterMessage,
  ModelResponse,
} from './openRouterService';
import { COUNCIL, SESSION } from '../constants';

// SSE Event types
export type SSEEvent =
  | { type: 'stage1_start' }
  | { type: 'stage1_response'; data: IStage1Response }
  | { type: 'stage1_complete' }
  | { type: 'stage2_start' }
  | { type: 'stage2_response'; data: IStage2Review }
  | { type: 'stage2_complete'; data: { labelToModel: Record<string, string>; aggregateRankings: AggregateRanking[] } }
  | { type: 'stage3_start' }
  | { type: 'stage3_response'; data: IStage3Synthesis }
  | { type: 'complete' }
  | { type: 'error'; error: string };

interface AggregateRanking {
  model: string;
  averageRank: number;
  rankingsCount: number;
}

// Result types (discriminated unions)
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

/**
 * Truncate text to specified length with ellipsis
 */
const truncateTitle = (text: string, maxLength = 50): string =>
  text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

/**
 * Validate session ID format (UUID v4)
 */
export const validateSessionId = (sessionId: unknown): boolean => {
  return typeof sessionId === 'string' && SESSION.ID_PATTERN.test(sessionId);
};

/**
 * Validate message content
 */
export const validateMessage = (
  message: unknown
): { valid: boolean; error?: string } => {
  if (typeof message !== 'string' || !message.trim()) {
    return { valid: false, error: 'Message is required' };
  }
  if (message.length > COUNCIL.MAX_MESSAGE_LENGTH) {
    return { valid: false, error: 'Message too long' };
  }
  return { valid: true };
};

/**
 * Create a new council session
 */
export const createSession = async (userId: string): Promise<CreateSessionResult> => {
  const count = await CouncilSession.countDocuments({ userId });
  if (count >= COUNCIL.MAX_SESSIONS_PER_USER) {
    return {
      success: false,
      error: 'Council session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
    };
  }

  const session = new CouncilSession({
    userId,
    sessionId: randomUUID(),
    title: 'New Council Session',
    messages: [],
  });

  await session.save();

  // Double-check to prevent race condition
  const finalCount = await CouncilSession.countDocuments({ userId });
  if (finalCount > COUNCIL.MAX_SESSIONS_PER_USER) {
    await CouncilSession.deleteOne({ sessionId: session.sessionId });
    return {
      success: false,
      error: 'Council session limit reached. Delete old sessions to continue.',
      code: 'SESSION_LIMIT_REACHED',
    };
  }

  return { success: true, session };
};

/**
 * Get all council sessions for a user
 */
export const getSessions = async (userId: string): Promise<GetSessionsResult> => {
  try {
    const sessions = await CouncilSession.find({ userId })
      .select('sessionId title createdAt updatedAt')
      .sort({ updatedAt: -1 });
    return { success: true, sessions };
  } catch {
    return { success: false, error: 'Failed to fetch sessions' };
  }
};

/**
 * Get a specific council session
 */
export const getSession = async (
  userId: string,
  sessionId: string
): Promise<GetSessionResult> => {
  const session = await CouncilSession.findOne({ userId, sessionId });
  if (!session) {
    return { success: false, error: 'Session not found' };
  }
  return { success: true, session };
};

/**
 * Delete a council session
 */
export const deleteSession = async (
  userId: string,
  sessionId: string
): Promise<DeleteSessionResult> => {
  const result = await CouncilSession.deleteOne({ userId, sessionId });
  if (result.deletedCount === 0) {
    return { success: false, error: 'Session not found' };
  }
  return { success: true };
};

/**
 * Build conversation history for context
 */
const buildConversationHistory = (
  messages: ICouncilMessage[]
): OpenRouterMessage[] => {
  const history: OpenRouterMessage[] = [];
  const recentMessages = messages.slice(-COUNCIL.RECENT_MESSAGES_LIMIT * 2);

  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      history.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant' && msg.stage3) {
      history.push({ role: 'assistant', content: msg.stage3.response });
    }
  }

  return history;
};

/**
 * Parse ranking from model's evaluation text
 */
const parseRankingFromText = (rankingText: string): string[] => {
  // Look for "FINAL RANKING:" section
  if (rankingText.includes('FINAL RANKING:')) {
    const parts = rankingText.split('FINAL RANKING:');
    if (parts.length >= 2) {
      const rankingSection = parts[1];
      // Try numbered list format first (e.g., "1. Response A")
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatches) {
        return numberedMatches.map((m) => {
          const match = m.match(/Response [A-Z]/);
          return match ? match[0] : '';
        }).filter(Boolean);
      }
      // Fallback: Extract all "Response X" patterns in order
      const matches = rankingSection.match(/Response [A-Z]/g);
      return matches || [];
    }
  }
  // Fallback: try to find any "Response X" patterns
  const matches = rankingText.match(/Response [A-Z]/g);
  return matches || [];
};

/**
 * Calculate aggregate rankings across all evaluations
 */
const calculateAggregateRankings = (
  stage2Results: IStage2Review[],
  labelToModel: Record<string, string>
): AggregateRanking[] => {
  const modelPositions: Record<string, number[]> = {};

  for (const review of stage2Results) {
    const parsedRanking = parseRankingFromText(review.ranking);

    parsedRanking.forEach((label, index) => {
      const position = index + 1;
      if (labelToModel[label]) {
        const modelName = labelToModel[label];
        if (!modelPositions[modelName]) {
          modelPositions[modelName] = [];
        }
        modelPositions[modelName].push(position);
      }
    });
  }

  const aggregate: AggregateRanking[] = [];
  for (const [model, positions] of Object.entries(modelPositions)) {
    if (positions.length > 0) {
      const avgRank = positions.reduce((a, b) => a + b, 0) / positions.length;
      aggregate.push({
        model,
        averageRank: Math.round(avgRank * 100) / 100,
        rankingsCount: positions.length,
      });
    }
  }

  // Sort by average rank (lower is better)
  aggregate.sort((a, b) => a.averageRank - b.averageRank);

  return aggregate;
};

/**
 * Stage 1: Collect individual responses from all council models
 */
async function* stage1CollectResponses(
  userMessage: string,
  history: OpenRouterMessage[]
): AsyncGenerator<SSEEvent> {
  yield { type: 'stage1_start' };

  const messages: OpenRouterMessage[] = [...history, { role: 'user', content: userMessage }];

  const responses = await queryCouncilModels(messages);

  const stage1Results: IStage1Response[] = [];
  for (const response of responses) {
    const result: IStage1Response = {
      model: response.model,
      response: response.content,
      responseTimeMs: response.responseTimeMs,
    };
    stage1Results.push(result);
    yield { type: 'stage1_response', data: result };
  }

  yield { type: 'stage1_complete' };

  return stage1Results;
}

/**
 * Stage 2: Each model ranks the anonymized responses
 */
async function* stage2CollectRankings(
  userMessage: string,
  stage1Results: IStage1Response[]
): AsyncGenerator<SSEEvent, { reviews: IStage2Review[]; labelToModel: Record<string, string> }> {
  yield { type: 'stage2_start' };

  // Create anonymized labels
  const labels = stage1Results.map((_, i) => String.fromCharCode(65 + i)); // A, B, C, ...

  // Create mapping from label to model
  const labelToModel: Record<string, string> = {};
  labels.forEach((label, i) => {
    labelToModel[`Response ${label}`] = stage1Results[i].model;
  });

  // Build ranking prompt
  const responsesText = labels
    .map((label, i) => `Response ${label}:\n${stage1Results[i].response}`)
    .join('\n\n');

  const rankingPrompt = `You are evaluating different responses to the following question:

Question: ${userMessage}

Here are the responses from different models (anonymized):

${responsesText}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`;

  const messages: OpenRouterMessage[] = [{ role: 'user', content: rankingPrompt }];

  const responses = await queryCouncilModels(messages);

  const stage2Results: IStage2Review[] = [];
  for (const response of responses) {
    const parsedRanking = parseRankingFromText(response.content);
    const review: IStage2Review = {
      model: response.model,
      ranking: response.content,
      parsedRanking,
      responseTimeMs: response.responseTimeMs,
    };
    stage2Results.push(review);
    yield { type: 'stage2_response', data: review };
  }

  const aggregateRankings = calculateAggregateRankings(stage2Results, labelToModel);
  yield { type: 'stage2_complete', data: { labelToModel, aggregateRankings } };

  return { reviews: stage2Results, labelToModel };
}

/**
 * Stage 3: Chairman synthesizes final response
 */
async function* stage3Synthesize(
  userMessage: string,
  stage1Results: IStage1Response[],
  stage2Results: IStage2Review[]
): AsyncGenerator<SSEEvent, IStage3Synthesis> {
  yield { type: 'stage3_start' };

  // Build comprehensive context for chairman
  const stage1Text = stage1Results
    .map((r) => `Model: ${r.model}\nResponse: ${r.response}`)
    .join('\n\n');

  const stage2Text = stage2Results
    .map((r) => `Model: ${r.model}\nRanking: ${r.ranking}`)
    .join('\n\n');

  const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: ${userMessage}

STAGE 1 - Individual Responses:
${stage1Text}

STAGE 2 - Peer Rankings:
${stage2Text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`;

  const messages: OpenRouterMessage[] = [{ role: 'user', content: chairmanPrompt }];

  const response = await queryChairman(messages);

  const stage3Result: IStage3Synthesis = {
    model: response.model,
    response: response.content,
    responseTimeMs: response.responseTimeMs,
  };

  yield { type: 'stage3_response', data: stage3Result };

  return stage3Result;
}

/**
 * Process a council message with 3 stages (SSE streaming)
 */
export async function* processCouncilMessage(
  userId: string,
  sessionId: string,
  userMessage: string
): AsyncGenerator<SSEEvent> {
  // Find session
  const session = await CouncilSession.findOne({ userId, sessionId });
  if (!session) {
    yield { type: 'error', error: 'Session not found' };
    return;
  }

  // Add user message
  session.messages.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });

  // Auto-generate title from first message
  if (session.messages.length === 1) {
    session.title = truncateTitle(userMessage);
  }

  await session.save();

  // Build conversation history
  const history = buildConversationHistory(session.messages);

  try {
    // Stage 1: Collect individual responses
    const stage1Results: IStage1Response[] = [];
    const stage1Gen = stage1CollectResponses(userMessage, history);
    for await (const event of stage1Gen) {
      yield event;
      if (event.type === 'stage1_response') {
        stage1Results.push(event.data);
      }
    }

    if (stage1Results.length === 0) {
      yield { type: 'error', error: 'All models failed to respond. Please try again.' };
      return;
    }

    // Stage 2: Collect rankings
    let stage2Results: IStage2Review[] = [];
    let labelToModel: Record<string, string> = {};
    const stage2Gen = stage2CollectRankings(userMessage, stage1Results);
    for await (const event of stage2Gen) {
      yield event;
      if (event.type === 'stage2_response') {
        stage2Results.push(event.data);
      }
    }
    // Get the final result from the generator
    const stage2Final = await stage2Gen.next();
    if (stage2Final.value) {
      labelToModel = stage2Final.value.labelToModel;
    }

    // Stage 3: Chairman synthesis
    let stage3Result: IStage3Synthesis | null = null;
    const stage3Gen = stage3Synthesize(userMessage, stage1Results, stage2Results);
    for await (const event of stage3Gen) {
      yield event;
      if (event.type === 'stage3_response') {
        stage3Result = event.data;
      }
    }

    if (!stage3Result) {
      yield { type: 'error', error: 'Chairman failed to synthesize response.' };
      return;
    }

    // Save complete assistant message
    session.messages.push({
      role: 'assistant',
      stage1: stage1Results,
      stage2: stage2Results,
      stage3: stage3Result,
      timestamp: new Date(),
    });

    // Update title with a portion of the chairman's response
    if (session.messages.length === 2) {
      session.title = truncateTitle(stage3Result.response);
    }

    await session.save();

    yield { type: 'complete' };
  } catch (error) {
    console.error('Council processing error:', error);
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Processing failed',
    };
  }
}

/**
 * Type guard for session limit error
 */
export const isSessionLimitError = (
  result: CreateSessionResult
): result is { success: false; error: string; code: string } => {
  return !result.success && 'code' in result && result.code === 'SESSION_LIMIT_REACHED';
};
