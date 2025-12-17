/**
 * Council 오케스트레이터
 *
 * 3단계 LLM Council 처리 흐름:
 * 1. Stage 1: 각 모델이 독립적으로 응답 생성
 * 2. Stage 2: 각 모델이 익명화된 응답들을 평가/순위 매김
 * 3. Stage 3: Chairman이 모든 입력을 종합하여 최종 응답 생성
 *
 * abort 처리 전략:
 * - 각 스테이지 진행 중 abort 시, 현재까지 수신된 부분 결과를 DB에 저장
 * - stage*StreamingContent 변수로 스트리밍 중인 데이터를 추적하여 abort 시 복구
 * - fetch AbortError는 try-catch로 잡아서 정상적인 abort 흐름으로 처리
 */

import {
  CouncilSession,
  IStage1Response,
  IStage2Review,
  IStage3Synthesis,
  COUNCIL,
  CouncilMode,
  getChairmanForMode,
  SSEEvent,
  OpenRouterMessage,
} from '@shared';
import { queryCouncilModelsStreaming, chatCompletionStreamWithReasoning } from './councilApi.service';
import { generateTitle } from './title.service';
import {
  buildPartialStage1Responses,
  buildPartialStage2Reviews,
} from '../utils/partialResultBuilder';
import { parseRankingFromText, calculateAggregateRankings } from './ranking.service';
import { buildConversationHistory } from './history.service';
import { saveAbortedMessage, saveCompleteMessage } from './persistence.service';
import {
  councilMessagesTotal,
  councilStageDuration,
  openrouterApiCalls,
  openrouterResponseTime,
  openrouterTokensUsed,
  getDeploymentEnv,
} from '@shared';

/** Stage 1: 각 Council 모델로부터 개별 응답 수집 (스트리밍) */
async function* stage1CollectResponses(
  userMessage: string,
  history: OpenRouterMessage[],
  mode: CouncilMode,
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

  // 모델별 누적 콘텐츠 및 메타데이터 추적
  const modelContents: Record<string, string> = {};
  const modelMeta: Record<string, { responseTimeMs: number; promptTokens?: number; completionTokens?: number }> = {};

  for await (const event of queryCouncilModelsStreaming(messages, mode, signal, COUNCIL.STAGE1_TIMEOUT_MS)) {
    if (signal?.aborted) return;

    if ('done' in event && event.done === true) {
      // 모델 응답 완료 이벤트
      modelMeta[event.model] = {
        responseTimeMs: event.responseTimeMs,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      };
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
      // 청크 이벤트 - 누적 후 클라이언트로 전달
      if (!modelContents[event.model]) {
        modelContents[event.model] = '';
      }
      modelContents[event.model] += event.delta;
      yield { type: 'stage1_chunk', model: event.model, delta: event.delta };
    }
  }

  // Stage 2/3에서 사용할 최종 결과 빌드
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

  councilStageDuration.labels('1', deploymentEnv).observe((Date.now() - stageStartTime) / 1000);
  yield { type: 'stage1_complete' };

  return stage1Results;
}

/** Stage 2: 각 모델이 익명화된 응답들을 평가하고 순위 매김 */
async function* stage2CollectRankings(
  userMessage: string,
  stage1Results: IStage1Response[],
  mode: CouncilMode,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent, { reviews: IStage2Review[]; labelToModel: Record<string, string> }> {
  const stageStartTime = Date.now();
  const deploymentEnv = getDeploymentEnv();
  yield { type: 'stage2_start' };

  // 익명화 라벨 생성 (A, B, C, ...)
  const labels = stage1Results.map((_, i) => String.fromCharCode(65 + i));

  // 라벨 → 모델 매핑 (나중에 결과 해석용)
  const labelToModel: Record<string, string> = {};
  labels.forEach((label, i) => {
    labelToModel[`Response ${label}`] = stage1Results[i].model;
  });

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

Now provide your evaluation and ranking, in English:`;

  const messages: OpenRouterMessage[] = [{ role: 'user', content: rankingPrompt }];

  // 모델별 누적 콘텐츠 및 메타데이터 추적
  const modelContents: Record<string, string> = {};
  const modelMeta: Record<string, { responseTimeMs: number; promptTokens?: number; completionTokens?: number }> = {};

  for await (const event of queryCouncilModelsStreaming(messages, mode, signal, COUNCIL.STAGE2_TIMEOUT_MS)) {
    if (signal?.aborted) return { reviews: [], labelToModel };

    if ('done' in event && event.done === true) {
      modelMeta[event.model] = {
        responseTimeMs: event.responseTimeMs,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      };
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
      if (!modelContents[event.model]) {
        modelContents[event.model] = '';
      }
      modelContents[event.model] += event.delta;
      yield { type: 'stage2_chunk', model: event.model, delta: event.delta };
    }
  }

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

  councilStageDuration.labels('2', deploymentEnv).observe((Date.now() - stageStartTime) / 1000);
  yield { type: 'stage2_complete', data: { labelToModel, aggregateRankings } };

  return { reviews: stage2Results, labelToModel };
}

/** Stage 3: Chairman이 모든 입력을 종합하여 최종 응답 생성 (reasoning 포함) */
async function* stage3Synthesize(
  userMessage: string,
  stage1Results: IStage1Response[],
  stage2Results: IStage2Review[],
  _labelToModel: Record<string, string>,  // 미사용 - Chairman은 익명화된 데이터만 수신
  mode: CouncilMode,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent, IStage3Synthesis> {
  const stageStartTime = Date.now();
  const deploymentEnv = getDeploymentEnv();
  yield { type: 'stage3_start' };

  // Chairman용 익명화 컨텍스트 (블라인드 평가)
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

  const chairmanModel = getChairmanForMode(mode);
  const startTime = Date.now();
  let content = '';
  let reasoning = '';
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let reasoningTokens: number | undefined;

  for await (const event of chatCompletionStreamWithReasoning(
    chairmanModel,
    messages,
    COUNCIL.CHAIRMAN_MAX_TOKENS,
    signal,
    COUNCIL.STAGE3_TIMEOUT_MS
  )) {
    if (signal?.aborted) {
      return {
        model: chairmanModel,
        response: content,
        reasoning: reasoning || undefined,
        responseTimeMs: Date.now() - startTime,
      };
    }

    if ('delta' in event) {
      if (event.delta) {
        content += event.delta;
        yield { type: 'stage3_chunk', delta: event.delta };
      }
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

  const responseTimeMs = Date.now() - startTime;
  openrouterApiCalls.labels(chairmanModel, '3', 'success', deploymentEnv).inc();
  openrouterResponseTime.labels(chairmanModel, '3', deploymentEnv).observe(responseTimeMs / 1000);
  if (promptTokens) {
    openrouterTokensUsed.labels(chairmanModel, '3', 'prompt', deploymentEnv).inc(promptTokens);
  }
  if (completionTokens) {
    openrouterTokensUsed.labels(chairmanModel, '3', 'completion', deploymentEnv).inc(completionTokens);
  }
  if (reasoningTokens) {
    openrouterTokensUsed.labels(chairmanModel, '3', 'reasoning', deploymentEnv).inc(reasoningTokens);
  }

  const stage3Result: IStage3Synthesis = {
    model: chairmanModel,
    response: content,
    reasoning: reasoning || undefined,
    responseTimeMs,
    promptTokens,
    completionTokens,
    reasoningTokens,
  };

  councilStageDuration.labels('3', deploymentEnv).observe((Date.now() - stageStartTime) / 1000);
  yield { type: 'stage3_response', data: stage3Result };

  return stage3Result;
}

/** 3단계 Council 메시지 처리 (SSE 스트리밍) */
export async function* processCouncilMessage(
  userId: string,
  sessionId: string,
  userMessage: string,
  mode: CouncilMode = 'lite',
  signal?: AbortSignal,
  onTitleGenerated?: (title: string) => void
): AsyncGenerator<SSEEvent> {
  const deploymentEnv = getDeploymentEnv();
  const chairmanModel = getChairmanForMode(mode);

  const session = await CouncilSession.findOne({ userId, sessionId });
  if (!session) {
    yield { type: 'error', error: 'Session not found' };
    return;
  }

  councilMessagesTotal.labels('user', deploymentEnv).inc();

  // 메모리상 세션에 사용자 메시지 추가 (히스토리 빌드용)
  // DB 저장은 마지막에 user+assistant 메시지를 원자적으로 저장
  // (abort 시 고아 user 메시지 방지)
  session.messages.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  });

  const history = buildConversationHistory(session.messages);

  // 첫 메시지인 경우 제목 생성을 병렬로 시작
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
        timeoutHandle.unref();  // 프로세스 종료 차단 방지
      }),
    ]);

    titleWithTimeout
      .then(async (title) => {
        clearTimeout(timeoutHandle);
        session.title = title;
        await session.save();
        onTitleGenerated(title);
      })
      .catch((err) => {
        clearTimeout(timeoutHandle);
        console.error('[Council] Title generation failed:', err);
      });
  }

  // abort 시 부분 결과 저장 헬퍼 (persistence service로 위임)
  const saveAborted = (
    stage1: IStage1Response[],
    stage2: IStage2Review[],
    stage3Content: string | null,
    stage3Reasoning?: string | null
  ) => saveAbortedMessage(session, mode, chairmanModel, stage1, stage2, stage3Content, stage3Reasoning);

  try {
    if (signal?.aborted) {
      console.log('[Council] Processing aborted before Stage 1');
      return;
    }

    // === Stage 1 ===
    const stage1Results: IStage1Response[] = [];
    // abort 시 복구용 스트리밍 콘텐츠 추적
    const stage1StreamingContent: Record<string, string> = {};
    const stage1Gen = stage1CollectResponses(userMessage, history, mode, signal);
    try {
      for await (const event of stage1Gen) {
        if (signal?.aborted) {
          console.log('[Council] Processing aborted during Stage 1');
          const partialStage1 = buildPartialStage1Responses(stage1Results, stage1StreamingContent);
          await saveAborted(partialStage1, [], null);
          return;
        }
        yield event;

        if (event.type === 'stage1_chunk' && 'model' in event && 'delta' in event) {
          if (!stage1StreamingContent[event.model]) {
            stage1StreamingContent[event.model] = '';
          }
          stage1StreamingContent[event.model] += event.delta;
        }

        // 모델 응답 완료 시 스트리밍 콘텐츠 정리 (이미 stage1Results에 포함됨)
        if (event.type === 'stage1_response') {
          stage1Results.push(event.data);
          delete stage1StreamingContent[event.data.model];
        }
      }
    } catch (error) {
      // fetch의 AbortError를 정상적인 abort 흐름으로 처리
      if (signal?.aborted) {
        console.log('[Council] Processing aborted during Stage 1 (caught exception)');
        const partialStage1 = buildPartialStage1Responses(stage1Results, stage1StreamingContent);
        await saveAborted(partialStage1, [], null);
        return;
      }
      throw error;
    }

    // 루프가 정상 종료된 경우에도 abort 체크 (예외 없이 종료된 케이스)
    if (signal?.aborted) {
      console.log('[Council] Processing aborted after Stage 1 loop');
      const partialStage1 = buildPartialStage1Responses(stage1Results, stage1StreamingContent);
      await saveAborted(partialStage1, [], null);
      return;
    }

    if (stage1Results.length === 0) {
      yield { type: 'error', error: 'All models failed to respond. Please try again.' };
      return;
    }

    // === Stage 2 ===
    let stage2Results: IStage2Review[] = [];
    let labelToModel: Record<string, string> = {};
    // abort 시 복구용 스트리밍 콘텐츠 추적
    const stage2StreamingContent: Record<string, string> = {};
    const stage2Gen = stage2CollectRankings(userMessage, stage1Results, mode, signal);
    for await (const event of stage2Gen) {
      if (signal?.aborted) {
        console.log('[Council] Processing aborted during Stage 2');
        // 스트리밍 콘텐츠를 부분 리뷰로 변환
        const partialStage2 = buildPartialStage2Reviews(stage2Results, stage2StreamingContent, parseRankingFromText);
        await saveAborted(stage1Results, partialStage2, null);
        return;
      }
      yield event;

      if (event.type === 'stage2_chunk' && 'model' in event && 'delta' in event) {
        if (!stage2StreamingContent[event.model]) {
          stage2StreamingContent[event.model] = '';
        }
        stage2StreamingContent[event.model] += event.delta;
      }

      // 모델 응답 완료 시 스트리밍 콘텐츠 정리 (이미 stage2Results에 포함됨)
      if (event.type === 'stage2_response') {
        stage2Results.push(event.data);
        delete stage2StreamingContent[event.data.model];
      } else if (event.type === 'stage2_complete' && event.data) {
        labelToModel = event.data.labelToModel;
      }
    }

    if (signal?.aborted) {
      console.log('[Council] Processing aborted before Stage 3');
      const partialStage2 = buildPartialStage2Reviews(stage2Results, stage2StreamingContent, parseRankingFromText);
      await saveAborted(stage1Results, partialStage2, null);
      return;
    }

    // === Stage 3 ===
    let stage3Result: IStage3Synthesis | null = null;
    // abort 시 복구용 스트리밍 콘텐츠/reasoning 추적
    let stage3StreamingContent = '';
    let stage3StreamingReasoning = '';
    const stage3Gen = stage3Synthesize(userMessage, stage1Results, stage2Results, labelToModel, mode, signal);
    try {
      for await (const event of stage3Gen) {
        if (signal?.aborted) {
          console.log('[Council] Processing aborted during Stage 3');
          await saveAborted(stage1Results, stage2Results, stage3StreamingContent || null, stage3StreamingReasoning || null);
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
      // fetch의 AbortError를 정상적인 abort 흐름으로 처리
      if (signal?.aborted) {
        console.log('[Council] Processing aborted during Stage 3 (caught exception)');
        await saveAborted(stage1Results, stage2Results, stage3StreamingContent || null, stage3StreamingReasoning || null);
        return;
      }
      throw error;
    }

    if (!stage3Result) {
      yield { type: 'error', error: 'Chairman failed to synthesize response.' };
      return;
    }

    await saveCompleteMessage(session, mode, stage1Results, stage2Results, stage3Result);
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
