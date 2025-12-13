/**
 * Streaming Message Component
 * Displays the current in-progress message with streaming content
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCouncilContext } from "../../state";
import { StageProgress } from "../StageProgress";
import { Stage1Panel } from "../Stage1Panel";
import { Stage2Panel } from "../Stage2Panel";
import { Stage3Panel } from "../Stage3Panel";

/**
 * Aborted indicator banner
 */
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
    isProcessing,
    wasAborted,
  } = useCouncilContext();

  // Only render if processing or was just aborted
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
      {/* Aborted indicator */}
      {wasAborted && !isProcessing && <AbortedIndicator />}

      {/* Stage progress indicator */}
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
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
