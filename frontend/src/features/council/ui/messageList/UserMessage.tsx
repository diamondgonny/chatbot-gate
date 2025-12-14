/**
 * User Message Component
 * Displays a user message in the chat
 */

"use client";

import { motion } from "framer-motion";
import type { CouncilUserMessage } from "../../domain";

interface UserMessageProps {
  message: CouncilUserMessage;
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end"
    >
      <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-xl">
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </motion.div>
  );
}
