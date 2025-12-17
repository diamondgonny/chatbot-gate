/**
 * Input Area Component
 * Message 입력 form 및 abort 버튼 처리
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useCouncilContext,
  useCouncilMessagesContext,
  useCouncilStatusContext,
} from "../../state";
import type { CouncilMode } from "../../domain";

interface InputAreaProps {
  sessionId: string;
  onMessageSent?: () => void;
}

/**
 * Send icon SVG (chat 스타일과 일치)
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

/**
 * Mode Toggle Component
 */
function ModeToggle({ mode, onToggle }: { mode: CouncilMode; onToggle: (m: CouncilMode) => void }) {
  return (
    <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-700/50 mr-3">
      <button
        type="button"
        onClick={() => onToggle('lite')}
        className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-all duration-200 ${
          mode === 'lite'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Lite
      </button>
      <button
        type="button"
        onClick={() => onToggle('ultra')}
        className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-all duration-200 ${
          mode === 'ultra'
            ? 'bg-purple-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Ultra
      </button>
    </div>
  );
}

// textarea 자동 크기 조정을 위한 상수
const LINE_HEIGHT = 24; // 라인당 px
const MIN_ROWS = 1;
const MAX_ROWS = 18;
// 단일 라인 mode에서 inline control의 너비 (toggle + send button + 간격)
const INLINE_CONTROLS_WIDTH = 190;

export function InputArea({ sessionId, onMessageSent }: InputAreaProps) {
  // State reads → 분리된 context (리렌더 최적화)
  const { messages } = useCouncilMessagesContext();
  const { isProcessing } = useCouncilStatusContext();
  // Actions → 기존 context (비즈니스 로직 유지)
  const { sendMessage, abortProcessing, setInputExpanded } = useCouncilContext();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<CouncilMode>("lite");
  const [isMultiline, setIsMultiline] = useState(false);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Content에 따라 textarea 자동 크기 조정
  useEffect(() => {
    const textarea = textareaRef.current;
    const measure = measureRef.current;
    const container = containerRef.current;
    if (!textarea || !measure || !container) return;

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const hasNewline = input.includes('\n');

    // Hidden span을 사용하여 실제 text 너비 측정
    const textWidth = measure.offsetWidth;
    // 단일 라인 mode에서 사용 가능한 너비 (container - inline control)
    const singleLineAvailable = container.clientWidth - INLINE_CONTROLS_WIDTH;

    setIsMultiline(prev => {
      // Newline은 항상 multiline을 트리거
      if (hasNewline) return true;

      if (prev) {
        // Multiline 종료: text가 단일 라인 가용 공간에 맞을 때
        return textWidth > singleLineAvailable;
      }

      // Multiline 진입: content가 wrap될 때 (scrollHeight가 단일 라인 초과)
      return scrollHeight > LINE_HEIGHT * 1.5;
    });
  }, [input]);

  // 순환 의존성 방지를 위해 높이 조정을 별도 effect로 분리
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const minHeight = LINE_HEIGHT * MIN_ROWS;
    const maxHeight = LINE_HEIGHT * MAX_ROWS;

    if (!isMultiline) {
      textarea.style.height = `${LINE_HEIGHT}px`;
    } else {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }

    setInputExpanded(isMultiline);
  }, [input, isMultiline, setInputExpanded]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isProcessing) return;

      sendMessage(sessionId, input.trim(), mode, onMessageSent);
      setInput("");
    },
    [input, isProcessing, sendMessage, sessionId, onMessageSent, mode]
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

  // textarea 높이에 따라 scrollbar 가시성 업데이트
  useEffect(() => {
    const textarea = textareaRef.current;
    const hasScrollbar = textarea
      ? textarea.scrollHeight > LINE_HEIGHT * MAX_ROWS
      : false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing DOM measurement to state
    setShowScrollbar(hasScrollbar);
  }, [input, isMultiline]);

  // Message가 없고 processing 중이 아닐 때만 input form 표시
  if (messages.length === 0 && !isProcessing) {
    return (
      <div className="p-4 bg-slate-900/80 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          {/* Text 너비 측정을 위한 hidden span */}
          <span
            ref={measureRef}
            className="absolute invisible whitespace-pre pointer-events-none"
            style={{
              fontSize: '16px',
              fontFamily: 'inherit',
              lineHeight: `${LINE_HEIGHT}px`,
            }}
            aria-hidden="true"
          >
            {input || ' '}
          </span>
          <div
            ref={containerRef}
            className={`bg-slate-800 rounded-xl border border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-transparent transition-all ${
              isMultiline ? "" : "flex items-center"
            }`}
          >
            <div className={isMultiline ? "px-4 pt-3" : "flex-1 px-3 py-2"}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask the council a question...`}
                rows={1}
                maxLength={65536}
                className={`w-full bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none resize-none ${
                  showScrollbar
                    ? "overflow-y-auto scrollbar-custom"
                    : "overflow-hidden"
                }`}
                style={{ lineHeight: `${LINE_HEIGHT}px` }}
              />
            </div>
            <div
              className={`${
                isMultiline
                  ? "flex justify-between items-center px-3 pb-3"
                  : "flex items-center pr-3"
              }`}
            >
              {/* Spacer for multiline alignment if needed, or put toggle here */}
              <div className={isMultiline ? "" : ""}>
                {/* Potentially put toggle here for multiline left side? */}
              </div>

              <div className="flex items-center">
                <ModeToggle mode={mode} onToggle={setMode} />
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors flex-shrink-0"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        </form>
        <p className="text-center text-xs text-slate-600 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    );
  }

  // Processing 중 abort 버튼 표시
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

  // Message가 있고 processing 중이 아닐 때 숨김
  return null;
}
