"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Stage1Response } from "@/types";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Stage1PanelProps {
  responses: Stage1Response[];
  isLoading?: boolean;
}

function formatModelName(model: string): string {
  // Extract readable name from model identifier
  // e.g., "anthropic/claude-sonnet-4" -> "Claude Sonnet 4"
  const parts = model.split("/");
  const name = parts[parts.length - 1];
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function Stage1Panel({ responses, isLoading }: Stage1PanelProps) {
  const [activeTab, setActiveTab] = useState(0);

  if (responses.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">
          Stage 1: Individual Responses
        </h3>
      </div>

      {/* Tab buttons */}
      <div className="flex overflow-x-auto border-b border-slate-700 bg-slate-800/30">
        {responses.map((response, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              activeTab === index
                ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {formatModelName(response.model)}
          </button>
        ))}
        {isLoading && (
          <div className="px-4 py-2 text-sm text-slate-500 flex items-center gap-2">
            <span className="animate-spin">⏳</span> Loading...
          </div>
        )}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {responses[activeTab] && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500">
                {formatModelName(responses[activeTab].model)}
              </span>
              <span className="text-xs text-slate-600">
                {responses[activeTab].responseTimeMs}ms
                {responses[activeTab].promptTokens !== undefined && (
                  <> | {responses[activeTab].promptTokens}+{responses[activeTab].completionTokens} tokens</>
                )}
              </span>
            </div>
            <MarkdownRenderer content={responses[activeTab].response} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
