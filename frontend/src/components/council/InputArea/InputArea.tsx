/**
 * Input Area Component
 * Handles message input form and abort button
 */

"use client";

import { useState, useCallback } from "react";
import { useCouncilContext } from "@/hooks/council";

interface InputAreaProps {
  sessionId: string;
  onMessageSent?: () => void;
}

/**
 * Send icon SVG
 */
function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

/**
 * Stop icon SVG
 */
function StopIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export function InputArea({ sessionId, onMessageSent }: InputAreaProps) {
  const { messages, isProcessing, sendMessage, abortProcessing } =
    useCouncilContext();
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isProcessing) return;

      sendMessage(sessionId, input.trim(), onMessageSent);
      setInput("");
    },
    [input, isProcessing, sendMessage, sessionId, onMessageSent]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  const handleAbort = useCallback(() => {
    abortProcessing(sessionId);
  }, [abortProcessing, sessionId]);

  // Show input form only when no messages exist and not processing
  if (messages.length === 0 && !isProcessing) {
    return (
      <div className="border-t border-slate-800 p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
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
            <SendIcon />
            Ask
          </button>
        </form>
        <p className="text-center text-xs text-slate-600 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    );
  }

  // Show abort button during processing
  if (isProcessing) {
    return (
      <div className="border-t border-slate-800 p-4">
        <div className="max-w-4xl mx-auto flex justify-center">
          <button
            onClick={handleAbort}
            className="px-6 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 rounded-xl transition-colors flex items-center gap-2"
          >
            <StopIcon />
            Stop Generation
          </button>
        </div>
      </div>
    );
  }

  // Hide when messages exist and not processing
  return null;
}
