/**
 * Assistant Message Component
 * Displays a completed assistant message with all three stages
 */

"use client";

import { motion } from "framer-motion";
import type { CouncilAssistantMessage } from "@/types";
import { computeMessageDisplayData } from "@/domain/council";
import { Stage1Panel, Stage2Panel, Stage3Panel } from "@/components/council";

interface AssistantMessageProps {
  message: CouncilAssistantMessage;
}

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
        Generation stopped - partial results
      </span>
    </div>
  );
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  // Compute display data from message using domain layer
  const { labelToModel, aggregateRankings } = computeMessageDisplayData(message);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Aborted message indicator */}
      {message.wasAborted && <AbortedIndicator />}

      {/* Stage 1: Individual responses */}
      <Stage1Panel responses={message.stage1} />

      {/* Stage 2: Peer reviews */}
      {message.stage2 && message.stage2.length > 0 && (
        <Stage2Panel
          reviews={message.stage2}
          labelToModel={labelToModel}
          aggregateRankings={aggregateRankings}
          hideResults={message.wasAborted && !message.stage3}
        />
      )}

      {/* Stage 3: Chairman synthesis */}
      {message.stage3 && <Stage3Panel synthesis={message.stage3} />}
    </motion.div>
  );
}
