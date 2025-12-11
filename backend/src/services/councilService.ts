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
  queryCouncilModelsStreaming,
  queryChairman,
  chatCompletion,
  chatCompletionStream,
  chatCompletionStreamWithReasoning,
  OpenRouterMessage,
  ModelResponse,
  ModelStreamEvent,
} from './openRouterService';
import { COUNCIL, SESSION } from '../constants';
import { generateTitle } from './titleService';

// SSE Event types
export type SSEEvent =
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
 * Stage 1: Collect individual responses from all council models (streaming)
 * Yields chunk events as responses stream in, then complete events with full responses
 */
async function* stage1CollectResponses(
  userMessage: string,
  history: OpenRouterMessage[],
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  yield { type: 'stage1_start' };

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: COUNCIL.SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userMessage },
  ];

  // Track accumulated content and metadata per model
  const modelContents: Record<string, string> = {};
  const modelMeta: Record<string, { responseTimeMs: number; promptTokens?: number; completionTokens?: number }> = {};

  // Stream responses from all models
  for await (const event of queryCouncilModelsStreaming(messages, signal)) {
    if (signal?.aborted) return;

    if ('done' in event && event.done === true) {
      // Model complete event (ModelStreamComplete)
      modelMeta[event.model] = {
        responseTimeMs: event.responseTimeMs,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      };
      yield {
        type: 'stage1_model_complete',
        model: event.model,
        responseTimeMs: event.responseTimeMs,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      };
    } else if ('delta' in event) {
      // Chunk event (ModelStreamChunk) - accumulate and forward
      if (!modelContents[event.model]) {
        modelContents[event.model] = '';
      }
      modelContents[event.model] += event.delta;
      yield { type: 'stage1_chunk', model: event.model, delta: event.delta };
    }
  }

  // Build final results for Stage 2/3 processing
  const stage1Results: IStage1Response[] = [];
  for (const [model, content] of Object.entries(modelContents)) {
    const meta = modelMeta[model] || { responseTimeMs: 0 };
    const result: IStage1Response = {
      model,
      response: content,
      responseTimeMs: meta.responseTimeMs,
      promptTokens: meta.promptTokens,
      completionTokens: meta.completionTokens,
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
  stage1Results: IStage1Response[],
  signal?: AbortSignal
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

  // Track accumulated content and metadata per model
  const modelContents: Record<string, string> = {};
  const modelMeta: Record<string, { responseTimeMs: number; promptTokens?: number; completionTokens?: number }> = {};

  // Stream responses from all models
  for await (const event of queryCouncilModelsStreaming(messages, signal)) {
    if (signal?.aborted) return { reviews: [], labelToModel };

    if ('done' in event && event.done === true) {
      // Model complete event
      modelMeta[event.model] = {
        responseTimeMs: event.responseTimeMs,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      };
      yield {
        type: 'stage2_model_complete',
        model: event.model,
        responseTimeMs: event.responseTimeMs,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      };
    } else if ('delta' in event) {
      // Chunk event - accumulate and forward
      if (!modelContents[event.model]) {
        modelContents[event.model] = '';
      }
      modelContents[event.model] += event.delta;
      yield { type: 'stage2_chunk', model: event.model, delta: event.delta };
    }
  }

  // Build final results
  const stage2Results: IStage2Review[] = [];
  for (const [model, content] of Object.entries(modelContents)) {
    const meta = modelMeta[model] || { responseTimeMs: 0 };
    const parsedRanking = parseRankingFromText(content);
    const review: IStage2Review = {
      model,
      ranking: content,
      parsedRanking,
      responseTimeMs: meta.responseTimeMs,
      promptTokens: meta.promptTokens,
      completionTokens: meta.completionTokens,
    };
    stage2Results.push(review);
    yield { type: 'stage2_response', data: review };
  }

  const aggregateRankings = calculateAggregateRankings(stage2Results, labelToModel);
  yield { type: 'stage2_complete', data: { labelToModel, aggregateRankings } };

  return { reviews: stage2Results, labelToModel };
}

/**
 * Stage 3: Chairman synthesizes final response with reasoning
 */
async function* stage3Synthesize(
  userMessage: string,
  stage1Results: IStage1Response[],
  stage2Results: IStage2Review[],
  _labelToModel: Record<string, string>,  // Unused - Chairman receives anonymized data
  signal?: AbortSignal
): AsyncGenerator<SSEEvent, IStage3Synthesis> {
  yield { type: 'stage3_start' };

  // Build anonymized context for chairman (blind evaluation)
  const stage1Text = stage1Results
    .map((r, i) => `Response ${String.fromCharCode(65 + i)}:\n${r.response}`)
    .join('\n\n');

  const stage2Text = stage2Results
    .map((r, i) => `Evaluator ${i + 1}:\n${r.ranking}`)
    .join('\n\n');

  const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then peer-reviewed each other's responses anonymously.

Original Question: ${userMessage}

STAGE 1 - Individual Responses (Anonymous):
${stage1Text}

STAGE 2 - Peer Rankings (Anonymous):
${stage2Text}

Your task: Synthesize all inputs into a single, comprehensive answer.

Output guidelines:
- Write as a direct response to the user, as if you're answering the question yourself
- Merge all valuable insights into one unified, seamless response
- The user should feel they're receiving one expert answer, not a summary of multiple sources
- Use your reasoning to evaluate quality, then present only the best synthesized result
- Use the same language as the original question for your response

Provide the council's collective wisdom as your own authoritative answer:`;

  const messages: OpenRouterMessage[] = [{ role: 'user', content: chairmanPrompt }];

  // Stream chairman response with reasoning enabled
  const startTime = Date.now();
  let content = '';
  let reasoning = '';
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let reasoningTokens: number | undefined;

  for await (const event of chatCompletionStreamWithReasoning(
    COUNCIL.CHAIRMAN_MODEL,
    messages,
    COUNCIL.CHAIRMAN_MAX_TOKENS,
    signal
  )) {
    if (signal?.aborted) {
      return {
        model: COUNCIL.CHAIRMAN_MODEL,
        response: content,
        reasoning: reasoning || undefined,
        responseTimeMs: Date.now() - startTime,
      };
    }

    if ('delta' in event) {
      // Emit content chunk
      if (event.delta) {
        content += event.delta;
        yield { type: 'stage3_chunk', delta: event.delta };
      }
      // Emit reasoning chunk
      if (event.reasoning) {
        reasoning += event.reasoning;
        yield { type: 'stage3_reasoning_chunk', delta: event.reasoning };
      }
    } else if ('done' in event) {
      promptTokens = event.promptTokens;
      completionTokens = event.completionTokens;
      reasoningTokens = event.reasoningTokens;
    }
  }

  const stage3Result: IStage3Synthesis = {
    model: COUNCIL.CHAIRMAN_MODEL,
    response: content,
    reasoning: reasoning || undefined,
    responseTimeMs: Date.now() - startTime,
    promptTokens,
    completionTokens,
    reasoningTokens,
  };

  yield { type: 'stage3_response', data: stage3Result };

  return stage3Result;
}

/**
 * Build partial Stage 1 responses from completed results + streaming content
 * Used when processing is aborted during Stage 1
 */
const buildPartialStage1Responses = (
  completedResponses: IStage1Response[],
  streamingContent: Record<string, string>
): IStage1Response[] => {
  const partialResponses: IStage1Response[] = [...completedResponses];

  for (const [model, content] of Object.entries(streamingContent)) {
    if (content.trim()) {
      partialResponses.push({
        model,
        response: content,  // Partial content
        responseTimeMs: 0,  // Unknown since not completed
      });
    }
  }

  return partialResponses;
};

/**
 * Build partial Stage 2 reviews from completed results + streaming content
 * Used when processing is aborted during Stage 2
 */
const buildPartialStage2Reviews = (
  completedReviews: IStage2Review[],
  streamingContent: Record<string, string>
): IStage2Review[] => {
  const partialReviews: IStage2Review[] = [...completedReviews];

  for (const [model, content] of Object.entries(streamingContent)) {
    if (content.trim()) {
      partialReviews.push({
        model,
        ranking: content,  // Partial content
        parsedRanking: parseRankingFromText(content),  // Try to parse what we have
        responseTimeMs: 0,  // Unknown since not completed
      });
    }
  }

  return partialReviews;
};

/**
 * Process a council message with 3 stages (SSE streaming)
 */
export async function* processCouncilMessage(
  userId: string,
  sessionId: string,
  userMessage: string,
  signal?: AbortSignal,
  onTitleGenerated?: (title: string) => void
): AsyncGenerator<SSEEvent> {
  // Find session
  const session = await CouncilSession.findOne({ userId, sessionId });
  if (!session) {
    yield { type: 'error', error: 'Session not found' };
    return;
  }

  // Add user message to in-memory session (for history building)
  // Note: We don't save here - both user and assistant messages are saved atomically
  // at the end to avoid orphan user messages if processing is aborted
  session.messages.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });

  // Build conversation history
  const history = buildConversationHistory(session.messages);

  // Start title generation in parallel for first message
  // Note: session.messages.length === 1 means only user message added so far
  const isFirstMessage = session.messages.length === 1;
  if (isFirstMessage && onTitleGenerated) {
    const TITLE_TIMEOUT_MS = 30000;
    const titleWithTimeout = Promise.race([
      generateTitle(userMessage),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Title generation timeout')), TITLE_TIMEOUT_MS)
      ),
    ]);

    titleWithTimeout.then(async (title) => {
      session.title = title;
      await session.save();  // Save title immediately
      onTitleGenerated(title);  // Notify via callback
    }).catch((err) => {
      console.error('[Council] Title generation failed:', err);
    });
  }

  // Helper to save partial results on abort
  const saveAbortedResults = async (
    stage1: IStage1Response[],
    stage2: IStage2Review[],
    stage3Content: string | null,
    stage3Reasoning?: string | null
  ) => {
    // Only save if we have at least some stage1 results
    if (stage1.length === 0) {
      console.log('[Council] No results to save on abort');
      return;
    }

    session.messages.push({
      role: 'assistant',
      stage1,
      stage2: stage2.length > 0 ? stage2 : undefined,
      stage3: stage3Content ? {
        model: COUNCIL.CHAIRMAN_MODEL,
        response: stage3Content,
        reasoning: stage3Reasoning || undefined,
        responseTimeMs: 0,
      } : undefined,
      wasAborted: true,
      timestamp: new Date(),
    });
    await session.save();
    console.log('[Council] Saved partial results on abort');
  };

  try {
    // Check for abort before starting
    if (signal?.aborted) {
      console.log('[Council] Processing aborted before Stage 1');
      return;
    }

    // Stage 1: Collect individual responses
    const stage1Results: IStage1Response[] = [];
    const stage1StreamingContent: Record<string, string> = {};  // Track streaming content for abort
    const stage1Gen = stage1CollectResponses(userMessage, history, signal);
    try {
      for await (const event of stage1Gen) {
        if (signal?.aborted) {
          console.log('[Council] Processing aborted during Stage 1');
          const partialStage1 = buildPartialStage1Responses(stage1Results, stage1StreamingContent);
          await saveAbortedResults(partialStage1, [], null);
          return;
        }
        yield event;

        // Track streaming content
        if (event.type === 'stage1_chunk' && 'model' in event && 'delta' in event) {
          if (!stage1StreamingContent[event.model]) {
            stage1StreamingContent[event.model] = '';
          }
          stage1StreamingContent[event.model] += event.delta;
        }

        // Clear streaming content when model completes
        if (event.type === 'stage1_response') {
          stage1Results.push(event.data);
          delete stage1StreamingContent[event.data.model];
        }
      }
    } catch (error) {
      // Catch AbortError thrown by fetch when signal is aborted
      if (signal?.aborted) {
        console.log('[Council] Processing aborted during Stage 1 (caught exception)');
        const partialStage1 = buildPartialStage1Responses(stage1Results, stage1StreamingContent);
        await saveAbortedResults(partialStage1, [], null);
        return;
      }
      throw error;  // Re-throw non-abort errors
    }

    // Check for abort after Stage 1 loop (handles case where loop exits normally without exception)
    if (signal?.aborted) {
      console.log('[Council] Processing aborted after Stage 1 loop');
      const partialStage1 = buildPartialStage1Responses(stage1Results, stage1StreamingContent);
      await saveAbortedResults(partialStage1, [], null);
      return;
    }

    if (stage1Results.length === 0) {
      yield { type: 'error', error: 'All models failed to respond. Please try again.' };
      return;
    }

    // Stage 2: Collect rankings
    let stage2Results: IStage2Review[] = [];
    let labelToModel: Record<string, string> = {};
    const stage2StreamingContent: Record<string, string> = {};  // Track streaming content for abort
    const stage2Gen = stage2CollectRankings(userMessage, stage1Results, signal);
    for await (const event of stage2Gen) {
      if (signal?.aborted) {
        console.log('[Council] Processing aborted during Stage 2');
        // Convert streaming content to partial reviews
        const partialStage2 = buildPartialStage2Reviews(stage2Results, stage2StreamingContent);
        await saveAbortedResults(stage1Results, partialStage2, null);
        return;
      }
      yield event;

      // Track streaming content
      if (event.type === 'stage2_chunk' && 'model' in event && 'delta' in event) {
        if (!stage2StreamingContent[event.model]) {
          stage2StreamingContent[event.model] = '';
        }
        stage2StreamingContent[event.model] += event.delta;
      }

      // Clear streaming content when model completes (it's now in stage2Results)
      if (event.type === 'stage2_response') {
        stage2Results.push(event.data);
        delete stage2StreamingContent[event.data.model];
      } else if (event.type === 'stage2_complete' && event.data) {
        labelToModel = event.data.labelToModel;
      }
    }

    // Check for abort before Stage 3
    if (signal?.aborted) {
      console.log('[Council] Processing aborted before Stage 3');
      const partialStage2 = buildPartialStage2Reviews(stage2Results, stage2StreamingContent);
      await saveAbortedResults(stage1Results, partialStage2, null);
      return;
    }

    // Stage 3: Chairman synthesis (with label mapping for context)
    let stage3Result: IStage3Synthesis | null = null;
    let stage3StreamingContent = '';  // Track streaming content for abort
    let stage3StreamingReasoning = '';  // Track reasoning content for abort
    const stage3Gen = stage3Synthesize(userMessage, stage1Results, stage2Results, labelToModel, signal);
    try {
      for await (const event of stage3Gen) {
        if (signal?.aborted) {
          console.log('[Council] Processing aborted during Stage 3');
          await saveAbortedResults(stage1Results, stage2Results, stage3StreamingContent || null, stage3StreamingReasoning || null);
          return;
        }
        yield event;
        if (event.type === 'stage3_chunk' && 'delta' in event) {
          stage3StreamingContent += event.delta;
        }
        if (event.type === 'stage3_reasoning_chunk' && 'delta' in event) {
          stage3StreamingReasoning += event.delta;
        }
        if (event.type === 'stage3_response') {
          stage3Result = event.data;
        }
      }
    } catch (error) {
      // Catch AbortError thrown by fetch when signal is aborted
      if (signal?.aborted) {
        console.log('[Council] Processing aborted during Stage 3 (caught exception)');
        await saveAbortedResults(stage1Results, stage2Results, stage3StreamingContent || null, stage3StreamingReasoning || null);
        return;
      }
      throw error;  // Re-throw non-abort errors
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

    // Save both user and assistant messages atomically
    // Note: Title is saved separately via callback for immediate UI update
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
