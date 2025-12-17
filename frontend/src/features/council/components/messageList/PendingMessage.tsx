/**
 * Pending Message Component
 * 확인 대기 중인 user message 표시
 */

"use client";

import { motion } from "framer-motion";
import { useCouncilMessagesContext, useCouncilStatusContext } from "../../hooks";

export function PendingMessage() {
  // State reads → 분리된 context (리렌더 최적화)
  const { pendingMessage } = useCouncilMessagesContext();
  const { isReconnecting } = useCouncilStatusContext();

  if (!pendingMessage) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end"
    >
      <div className="bg-blue-600/70 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-xl">
        <p className="text-sm whitespace-pre-wrap">{pendingMessage}</p>
        <p className="text-xs text-blue-200 mt-1 flex items-center gap-1">
          <span className="animate-spin">⏳</span>
          {isReconnecting ? "Reconnecting..." : "Sending..."}
        </p>
      </div>
    </motion.div>
  );
}
