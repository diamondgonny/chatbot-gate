/**
 * User Message Component
 * Chat에서 user message 표시
 */

"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import type { CouncilUserMessage } from "../../types";

interface UserMessageProps {
  message: CouncilUserMessage;
}

export const UserMessage = memo(function UserMessage({ message }: UserMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end"
    >
      <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-xl">
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </motion.div>
  );
});
