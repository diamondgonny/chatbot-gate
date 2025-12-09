"use client";

import { motion } from "framer-motion";
import type { Stage3Synthesis } from "@/types";

interface Stage3PanelProps {
  synthesis: Stage3Synthesis | null;
  isLoading?: boolean;
}

function formatModelName(model: string): string {
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function Stage3Panel({ synthesis, isLoading }: Stage3PanelProps) {
  if (!synthesis && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-green-900/20 to-slate-800/50 rounded-xl border border-green-700/30 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-green-700/30 bg-green-900/10">
        <h3 className="text-sm font-medium text-green-400 flex items-center gap-2">
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
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Stage 3: Council&apos;s Final Answer
        </h3>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center gap-3 text-slate-400">
            <span className="animate-spin">⏳</span>
            <span>Chairman is synthesizing the final answer...</span>
          </div>
        ) : synthesis ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-green-500/70">
                Chairman: {formatModelName(synthesis.model)}
              </span>
              <span className="text-xs text-slate-600">
                {synthesis.responseTimeMs}ms
              </span>
            </div>
            <div className="text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
              {synthesis.response}
            </div>
          </>
        ) : null}
      </div>
    </motion.div>
  );
}
