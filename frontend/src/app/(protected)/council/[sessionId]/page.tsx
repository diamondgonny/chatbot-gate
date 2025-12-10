"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCouncilSessions, useCouncilChat } from "@/hooks";
import {
  CouncilSidebar,
  StageProgress,
  Stage1Panel,
  Stage2Panel,
  Stage3Panel,
} from "@/components/council";
import type { CouncilMessage, CouncilAssistantMessage, Stage1Response, Stage2Review, AggregateRanking } from "@/types";

/**
 * Reconstruct labelToModel mapping from stage1 responses
 * Maps "Response A" -> model name, "Response B" -> model name, etc.
 */
function buildLabelToModel(stage1: Stage1Response[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  stage1.forEach((response, index) => {
    const label = `Response ${String.fromCharCode(65 + index)}`; // A, B, C...
    mapping[label] = response.model;
  });
  return mapping;
}

/**
 * Parse ranking labels from review text
 */
function parseRankingFromText(rankingText: string): string[] {
  if (rankingText.includes("FINAL RANKING:")) {
    const parts = rankingText.split("FINAL RANKING:");
    if (parts.length >= 2) {
      const rankingSection = parts[1];
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatches) {
        return numberedMatches
          .map((m) => {
            const match = m.match(/Response [A-Z]/);
            return match ? match[0] : "";
          })
          .filter(Boolean);
      }
      const matches = rankingSection.match(/Response [A-Z]/g);
      return matches || [];
    }
  }
  const matches = rankingText.match(/Response [A-Z]/g);
  return matches || [];
}

/**
 * Calculate aggregate rankings from stage2 reviews
 */
function calculateAggregateRankings(
  stage2: Stage2Review[],
  labelToModel: Record<string, string>
): AggregateRanking[] {
  const modelPositions: Record<string, number[]> = {};

  for (const review of stage2) {
    // Guard against missing/invalid parsedRanking (older records or failed extraction)
    const parsedRanking = Array.isArray(review.parsedRanking) && review.parsedRanking.length > 0
      ? review.parsedRanking
      : parseRankingFromText(review.ranking || "");

    parsedRanking.forEach((label, index) => {
      const position = index + 1;
      if (labelToModel[label]) {
        const modelName = labelToModel[label];
        if (!modelPositions[modelName]) {
          modelPositions[modelName] = [];
        }
        modelPositions[modelName].push(position);
      }
    });
  }

  const aggregate: AggregateRanking[] = [];
  for (const [model, positions] of Object.entries(modelPositions)) {
    if (positions.length > 0) {
      const avgRank = positions.reduce((a, b) => a + b, 0) / positions.length;
      aggregate.push({
        model,
        averageRank: Math.round(avgRank * 100) / 100,
        rankingsCount: positions.length,
      });
    }
  }

  aggregate.sort((a, b) => a.averageRank - b.averageRank);
  return aggregate;
}

export default function CouncilSessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    sessions,
    isLoading: sessionsLoading,
    createSession,
    removeSession,
    loadSessions,
  } = useCouncilSessions();

  const {
    messages,
    pendingMessage,
    currentStage,
    stage1Responses,
    stage2Reviews,
    stage3Synthesis,
    labelToModel,
    aggregateRankings,
    isProcessing,
    isLoading: chatLoading,
    error,
    loadSession,
    sendMessage,
    abortProcessing,
    clearError,
  } = useCouncilChat();

  // Load session on mount
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingMessage, stage1Responses, stage2Reviews, stage3Synthesis, scrollToBottom]);

  const handleNewSession = async () => {
    const newSessionId = await createSession();
    if (newSessionId) {
      router.push(`/council/${newSessionId}`);
    }
  };

  const handleSelectSession = (selectedSessionId: string) => {
    if (selectedSessionId !== sessionId) {
      router.push(`/council/${selectedSessionId}`);
    }
  };

  const handleDeleteSession = async (targetSessionId: string) => {
    if (confirm("Are you sure you want to delete this session?")) {
      const success = await removeSession(targetSessionId);
      if (success && targetSessionId === sessionId) {
        // Navigate to first remaining session or council home
        await loadSessions();
        const remainingSessions = sessions.filter(
          (s) => s.sessionId !== targetSessionId
        );
        if (remainingSessions.length > 0) {
          router.push(`/council/${remainingSessions[0].sessionId}`);
        } else {
          router.push("/council");
        }
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    sendMessage(sessionId, input.trim(), loadSessions);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Check if message is an assistant message
  const isAssistantMessage = (msg: CouncilMessage): msg is CouncilAssistantMessage => {
    return msg.role === "assistant";
  };

  return (
    <div className="h-screen flex">
      <CouncilSidebar
        sessions={sessions}
        currentSessionId={sessionId}
        isLoading={sessionsLoading}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-slate-900">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4">
          {chatLoading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <span className="animate-spin mr-2">⏳</span> Loading session...
            </div>
          ) : messages.length === 0 && !isProcessing && !pendingMessage ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-slate-400">
                <p className="mb-2">Start by asking a question.</p>
                <p className="text-sm text-slate-500">
                  5 AI models will collaborate to provide you with a
                  comprehensive answer.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {message.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-xl">
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ) : isAssistantMessage(message) ? (
                    (() => {
                      // Reconstruct mapping and rankings from stored stage1/stage2 data
                      const msgLabelToModel = buildLabelToModel(message.stage1);
                      const msgAggregateRankings = calculateAggregateRankings(
                        message.stage2,
                        msgLabelToModel
                      );
                      return (
                        <div className="space-y-4">
                          <Stage1Panel key={`s1-${index}`} responses={message.stage1} />
                          <Stage2Panel
                            key={`s2-${index}`}
                            reviews={message.stage2}
                            labelToModel={msgLabelToModel}
                            aggregateRankings={msgAggregateRankings}
                          />
                          <Stage3Panel key={`s3-${index}`} synthesis={message.stage3} />
                        </div>
                      );
                    })()
                  ) : null}
                </motion.div>
              ))}

              {/* Pending message (shown while waiting for connection confirmation) */}
              {pendingMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div className="bg-blue-600/70 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-xl">
                    <p className="text-sm whitespace-pre-wrap">{pendingMessage}</p>
                    <p className="text-xs text-blue-200 mt-1 flex items-center gap-1">
                      <span className="animate-spin">⏳</span> Sending...
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Current processing state */}
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <StageProgress
                    currentStage={currentStage}
                    stage1Count={stage1Responses.length}
                    stage2Count={stage2Reviews.length}
                    hasStage3={!!stage3Synthesis}
                  />

                  <AnimatePresence>
                    {stage1Responses.length > 0 && (
                      <Stage1Panel
                        key="stage1-panel"
                        responses={stage1Responses}
                        isLoading={currentStage === "stage1"}
                      />
                    )}

                    {stage2Reviews.length > 0 && (
                      <Stage2Panel
                        key="stage2-panel"
                        reviews={stage2Reviews}
                        labelToModel={labelToModel}
                        aggregateRankings={aggregateRankings}
                        isLoading={currentStage === "stage2"}
                      />
                    )}

                    {(stage3Synthesis || currentStage === "stage3") && (
                      <Stage3Panel
                        key="stage3-panel"
                        synthesis={stage3Synthesis}
                        isLoading={currentStage === "stage3"}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 flex items-center justify-between"
                >
                  <span className="text-red-400 text-sm">{error}</span>
                  <button
                    onClick={clearError}
                    className="text-red-400 hover:text-red-300"
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
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area - only show form when no messages exist, abort button during processing */}
        {messages.length === 0 && !isProcessing && (
          <div className="border-t border-slate-800 p-4">
            <form
              onSubmit={handleSubmit}
              className="max-w-4xl mx-auto flex gap-3"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the council a question..."
                rows={2}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Ask
              </button>
            </form>
            <p className="text-center text-xs text-slate-600 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        )}

        {isProcessing && (
          <div className="border-t border-slate-800 p-4">
            <div className="max-w-4xl mx-auto flex justify-center">
              <button
                onClick={abortProcessing}
                className="px-6 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 rounded-xl transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
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
                Stop Generation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
