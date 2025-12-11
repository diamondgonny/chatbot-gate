/**
 * Council Orchestrator
 * Handles 3-stage LLM Council orchestration and SSE streaming.
 */

import {
  CouncilSession,
  IStage1Response,
  IStage2Review,
  IStage3Synthesis,
} from '../../models/CouncilSession';
import {
  queryCouncilModelsStreaming,
  chatCompletionStreamWithReasoning,
  OpenRouterMessage,
} from '../openRouterService';
import { COUNCIL } from '../../constants';
import { generateTitle } from '../titleService';
import {
  buildPartialStage1Responses,
  buildPartialStage2Reviews,
} from '../../utils/partialResultBuilder';
import {
  parseRankingFromText,
  calculateAggregateRankings,
} from './councilRankingService';
import { buildConversationHistory } from './councilHistoryBuilder';
import type { SSEEvent } from '../../types/council';
import {
  councilMessagesTotal,
  councilStageDuration,
  openrouterApiCalls,
  openrouterResponseTime,
  openrouterTokensUsed,
  getDeploymentEnv,
} from '../../metrics/metricsRegistry';

/**
 * Stage 1: Collect individual responses from all council models (streaming)
 * Yields chunk events as responses stream in, then complete events with full responses
 */
async function* stage1CollectResponses(
  userMessage: string,
  history: OpenRouterMessage[],
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  const stageStartTime = Date.now();
  const deploymentEnv = getDeploymentEnv();
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
      // Record OpenRouter metrics
      openrouterApiCalls.labels(event.model, '1', 'success', deploymentEnv).inc();
      openrouterResponseTime.labels(event.model, '1', deploymentEnv).observe(event.responseTimeMs / 1000);
      if (event.promptTokens) {
        openrouterTokensUsed.labels(event.model, '1', 'prompt', deploymentEnv).inc(event.promptTokens);
      }
      if (event.completionTokens) {
        openrouterTokensUsed.labels(event.model, '1', 'completion', deploymentEnv).inc(event.completionTokens);
      }
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

  // Record stage 1 duration
  councilStageDuration.labels('1', deploymentEnv).observe((Date.now() - stageStartTime) / 1000);
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
  const stageStartTime = Date.now();
  const deploymentEnv = getDeploymentEnv();
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
      // Record OpenRouter metrics
      openrouterApiCalls.labels(event.model, '2', 'success', deploymentEnv).inc();
      openrouterResponseTime.labels(event.model, '2', deploymentEnv).observe(event.responseTimeMs / 1000);
      if (event.promptTokens) {
        openrouterTokensUsed.labels(event.model, '2', 'prompt', deploymentEnv).inc(event.promptTokens);
      }
      if (event.completionTokens) {
        openrouterTokensUsed.labels(event.model, '2', 'completion', deploymentEnv).inc(event.completionTokens);
      }
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

  // Record stage 2 duration
  councilStageDuration.labels('2', deploymentEnv).observe((Date.now() - stageStartTime) / 1000);
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
  const stageStartTime = Date.now();
  const deploymentEnv = getDeploymentEnv();
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

  // Record OpenRouter metrics for Chairman
  const responseTimeMs = Date.now() - startTime;
  openrouterApiCalls.labels(COUNCIL.CHAIRMAN_MODEL, '3', 'success', deploymentEnv).inc();
  openrouterResponseTime.labels(COUNCIL.CHAIRMAN_MODEL, '3', deploymentEnv).observe(responseTimeMs / 1000);
  if (promptTokens) {
    openrouterTokensUsed.labels(COUNCIL.CHAIRMAN_MODEL, '3', 'prompt', deploymentEnv).inc(promptTokens);
  }
  if (completionTokens) {
    openrouterTokensUsed.labels(COUNCIL.CHAIRMAN_MODEL, '3', 'completion', deploymentEnv).inc(completionTokens);
  }
  if (reasoningTokens) {
    openrouterTokensUsed.labels(COUNCIL.CHAIRMAN_MODEL, '3', 'reasoning', deploymentEnv).inc(reasoningTokens);
  }

  const stage3Result: IStage3Synthesis = {
    model: COUNCIL.CHAIRMAN_MODEL,
    response: content,
    reasoning: reasoning || undefined,
    responseTimeMs,
    promptTokens,
    completionTokens,
    reasoningTokens,
  };

  // Record stage 3 duration
  councilStageDuration.labels('3', deploymentEnv).observe((Date.now() - stageStartTime) / 1000);
  yield { type: 'stage3_response', data: stage3Result };

  return stage3Result;
}

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
  const deploymentEnv = getDeploymentEnv();

  // Find session
  const session = await CouncilSession.findOne({ userId, sessionId });
  if (!session) {
    yield { type: 'error', error: 'Session not found' };
    return;
  }

  // Record user message
  councilMessagesTotal.labels('user', deploymentEnv).inc();

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
    let timeoutHandle: ReturnType<typeof setTimeout>;

    const titleWithTimeout = Promise.race([
      generateTitle(userMessage),
      new Promise<string>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('Title generation timeout')),
          TITLE_TIMEOUT_MS
        );
        timeoutHandle.unref();  // Don't block process exit
      }),
    ]);

    titleWithTimeout
      .then(async (title) => {
        clearTimeout(timeoutHandle);  // Clean up timer on success
        session.title = title;
        await session.save();  // Save title immediately
        onTitleGenerated(title);  // Notify via callback
      })
      .catch((err) => {
        clearTimeout(timeoutHandle);  // Clean up timer on failure too
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
        const partialStage2 = buildPartialStage2Reviews(stage2Results, stage2StreamingContent, parseRankingFromText);
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
      const partialStage2 = buildPartialStage2Reviews(stage2Results, stage2StreamingContent, parseRankingFromText);
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

    // Record AI message
    councilMessagesTotal.labels('ai', deploymentEnv).inc();

    yield { type: 'complete' };
  } catch (error) {
    console.error('Council processing error:', error);
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : 'Processing failed',
    };
  }
}
