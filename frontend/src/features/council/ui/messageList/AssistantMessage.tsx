/**
 * Assistant Message Component
 * 3개 stage가 모두 포함된 완료된 assistant message 표시
 */

"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import type { CouncilAssistantMessage } from "../../domain";
import { computeMessageDisplayData } from "../../domain";
import { Stage1Panel } from "../Stage1Panel";
import { Stage2Panel } from "../Stage2Panel";
import { Stage3Panel } from "../Stage3Panel";

interface AssistantMessageProps {
  message: CouncilAssistantMessage;
}

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

export const AssistantMessage = memo(function AssistantMessage({ message }: AssistantMessageProps) {
  // Domain layer를 사용하여 message로부터 표시 데이터 계산
  const { labelToModel, aggregateRankings } = computeMessageDisplayData(message);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* 중단된 message 표시 */}
      {message.wasAborted && <AbortedIndicator />}

      {/* Stage 1: 개별 response */}
      <Stage1Panel responses={message.stage1} />

      {/* Stage 2: Peer review */}
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
});
