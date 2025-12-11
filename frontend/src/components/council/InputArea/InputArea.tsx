/**
 * Input Area Component
 * Handles message input form and abort button
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useCouncilContext } from "@/hooks/council";

interface InputAreaProps {
  sessionId: string;
  onMessageSent?: () => void;
}

/**
 * Send icon SVG (matches chat style)
 */
function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5"
    >
      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
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

// Constants for textarea auto-resize
const LINE_HEIGHT = 24; // px per line
const MIN_ROWS = 1;
const MAX_ROWS = 18;

export function InputArea({ sessionId, onMessageSent }: InputAreaProps) {
  const { messages, isProcessing, sendMessage, abortProcessing, setInputExpanded } =
    useCouncilContext();
  const [input, setInput] = useState("");
  const [isMultiline, setIsMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";

    const minHeight = LINE_HEIGHT * MIN_ROWS;
    const maxHeight = LINE_HEIGHT * MAX_ROWS;
    const scrollHeight = textarea.scrollHeight;

    const hasNewline = input.includes('\n');
    const exceedsSingleLine = scrollHeight > LINE_HEIGHT * 1.5;
    const multiline = hasNewline || exceedsSingleLine;
    setIsMultiline(multiline);

    if (!multiline) {
      textarea.style.height = `${LINE_HEIGHT}px`;
    } else {
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }

    setInputExpanded(multiline);
  }, [input, setInputExpanded]);

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

  const showScrollbar = textareaRef.current
    ? textareaRef.current.scrollHeight > LINE_HEIGHT * MAX_ROWS
    : false;

  // Show input form only when no messages exist and not processing
  if (messages.length === 0 && !isProcessing) {
    return (
      <div className="p-4 bg-slate-900/80 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className={`bg-slate-800 rounded-xl border border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-transparent transition-all ${
            isMultiline ? '' : 'flex items-center'
          }`}>
            <div className={isMultiline ? 'px-4 pt-3' : 'flex-1 px-3 py-2'}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the council a question..."
                rows={1}
                maxLength={65536}
                className={`w-full bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none resize-none ${
                  showScrollbar ? 'overflow-y-auto scrollbar-custom' : 'overflow-hidden'
                }`}
                style={{ lineHeight: `${LINE_HEIGHT}px` }}
              />
            </div>
            <div className={isMultiline ? 'flex justify-end px-3 pb-3' : 'pr-3'}>
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors flex-shrink-0"
              >
                <SendIcon />
              </button>
            </div>
          </div>
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
      <div className="p-4">
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
