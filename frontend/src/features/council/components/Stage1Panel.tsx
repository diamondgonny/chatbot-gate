"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Stage1Response, CurrentStage } from "../types";
import { formatModelName } from "../utils";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Stage1PanelProps {
  responses: Stage1Response[];
  streamingContent?: Record<string, string>;
  completedModels?: string[];
  currentStage?: CurrentStage;
  isLoading?: boolean;
  wasAborted?: boolean;
}

export function Stage1Panel({
  responses,
  streamingContent = {},
  completedModels = [],
  currentStage,
  isLoading,
  wasAborted
}: Stage1PanelProps) {
  const [activeTab, setActiveTab] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // 완료된 response와 streaming model 결합
  const allModels = useMemo(() => {
    const completedModels = responses.map((r) => r.model);
    const streamingModels = Object.keys(streamingContent).filter(
      (m) => !completedModels.includes(m)
    );
    return [...completedModels, ...streamingModels];
  }, [responses, streamingContent]);

  // Streaming content 업데이트 시 하단으로 자동 scroll
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamingContent]);

  // 활성 tab의 content 가져오기 (완료된 response 또는 streaming)
  const activeModel = allModels[activeTab];
  const completedResponse = responses.find((r) => r.model === activeModel);
  const isModelInCompletedList = completedModels.includes(activeModel);
  const isStreaming = !completedResponse && !!streamingContent[activeModel] && !isModelInCompletedList;
  const isComplete = isModelInCompletedList && currentStage === "stage1";
  const activeContent = completedResponse?.response || streamingContent[activeModel] || "";

  if (allModels.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">
          Stage 1: Individual Responses
        </h3>
      </div>

      {/* Tab button */}
      <div className="flex overflow-x-auto border-b border-slate-700 bg-slate-800/30">
        {allModels.map((model, index) => {
          const isModelStreaming = !responses.find((r) => r.model === model) && !completedModels.includes(model);
          const isModelComplete = completedModels.includes(model) && currentStage === "stage1";
          return (
            <button
              key={model}
              onClick={() => setActiveTab(index)}
              className={`px-4 py-2 text-sm whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === index
                  ? "text-blue-400 border-b-2 border-blue-400 bg-slate-800/50"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              {formatModelName(model)}
              {isModelStreaming && !wasAborted && (
                <span className="ml-1 inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              )}
              {isModelComplete && !wasAborted && (
                <span className="ml-1 text-green-400 text-xs">✓</span>
              )}
            </button>
          );
        })}
        {isLoading && allModels.length === 0 && (
          <div className="px-4 py-2 text-sm text-slate-500 flex items-center gap-2">
            <span className="animate-spin">⏳</span> Connecting...
          </div>
        )}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeModel && (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500">
                {formatModelName(activeModel)}
                {isStreaming && !wasAborted && (
                  <span className="ml-2 text-green-400">● Streaming...</span>
                )}
                {isComplete && !wasAborted && (
                  <span className="ml-2 text-green-400">✓ Complete!</span>
                )}
              </span>
              {completedResponse && (
                <span className="text-xs text-slate-600">
                  {completedResponse.responseTimeMs}ms
                  {completedResponse.promptTokens !== undefined && (
                    <> | {completedResponse.promptTokens}+{completedResponse.completionTokens} tokens</>
                  )}
                </span>
              )}
            </div>
            <div ref={contentRef}>
              <MarkdownRenderer content={activeContent} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
