/**
 * Streaming Message Component
 * Streaming content와 함께 현재 진행 중인 message 표시
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCouncilStreamContext, useCouncilStatusContext } from "../../state";
import { StageProgress } from "../StageProgress";
import { Stage1Panel } from "../Stage1Panel";
import { Stage2Panel } from "../Stage2Panel";
import { Stage3Panel } from "../Stage3Panel";

function AbortedIndicator() {
  return (
    <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-4 py-2 flex items-center gap-2">
      <svg
        className="w-5 h-5 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
      <span className="text-red-400 text-sm">
        Generation stopped - partial results shown below
      </span>
    </div>
  );
}

export function StreamingMessage() {
  // Stream state → 분리된 context (re-render 최적화)
  const {
    currentStage,
    stage1Responses,
    stage1StreamingContent,
    stage2Reviews,
    stage2StreamingContent,
    stage3Synthesis,
    stage3StreamingContent,
    stage3ReasoningContent,
    labelToModel,
    aggregateRankings,
  } = useCouncilStreamContext();

  // Status state → 분리된 context
  const { isProcessing, wasAborted } = useCouncilStatusContext();

  // 처리 중이거나 방금 중단된 경우에만 render
  if (!isProcessing && !wasAborted) {
    return null;
  }

  const hasStage1Content =
    stage1Responses.length > 0 ||
    Object.keys(stage1StreamingContent).length > 0;
  const hasStage2Content =
    stage2Reviews.length > 0 || Object.keys(stage2StreamingContent).length > 0;
  const hasStage3Content =
    stage3Synthesis ||
    stage3StreamingContent ||
    stage3ReasoningContent ||
    currentStage === "stage3";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* 중단 표시 */}
      {wasAborted && !isProcessing && <AbortedIndicator />}

      {/* Stage 진행 표시 */}
      <StageProgress
        currentStage={currentStage}
        stage1Count={
          stage1Responses.length + Object.keys(stage1StreamingContent).length
        }
        stage2Count={
          stage2Reviews.length + Object.keys(stage2StreamingContent).length
        }
        hasStage3={!!stage3Synthesis || !!stage3StreamingContent || !!stage3ReasoningContent}
        wasAborted={wasAborted}
      />

      <AnimatePresence>
        {/* Stage 1 Panel */}
        {hasStage1Content && (
          <Stage1Panel
            key="stage1-panel"
            responses={stage1Responses}
            streamingContent={stage1StreamingContent}
            isLoading={currentStage === "stage1"}
            wasAborted={wasAborted}
          />
        )}

        {/* Stage 2 Panel */}
        {hasStage2Content && (
          <Stage2Panel
            key="stage2-panel"
            reviews={stage2Reviews}
            streamingContent={stage2StreamingContent}
            labelToModel={labelToModel}
            aggregateRankings={aggregateRankings}
            isLoading={currentStage === "stage2"}
            wasAborted={wasAborted}
          />
        )}

        {/* Stage 3 Panel */}
        {hasStage3Content && (
          <Stage3Panel
            key="stage3-panel"
            synthesis={stage3Synthesis}
            streamingContent={stage3StreamingContent}
            streamingReasoning={stage3ReasoningContent}
            isLoading={currentStage === "stage3"}
            wasAborted={wasAborted}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
