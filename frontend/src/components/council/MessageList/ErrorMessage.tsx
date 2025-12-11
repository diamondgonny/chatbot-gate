/**
 * Error Message Component
 * Displays error messages with dismiss button
 */

"use client";

import { motion } from "framer-motion";
import { useCouncilContext } from "@/hooks/council";

export function ErrorMessage() {
  const { error, clearError } = useCouncilContext();

  if (!error) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 flex items-center justify-between"
    >
      <span className="text-red-400 text-sm">{error}</span>
      <button
        onClick={clearError}
        className="text-red-400 hover:text-red-300"
        aria-label="Dismiss error"
      >
        <svg
          className="w-4 h-4"
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
      </button>
    </motion.div>
  );
}
