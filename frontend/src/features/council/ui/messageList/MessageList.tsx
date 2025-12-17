/**
 * Message List Component
 * Council chat의 모든 message를 표시하는 main container
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useCouncilContext } from "../../state";
import type { CouncilMessage, CouncilAssistantMessage } from "../../domain";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { PendingMessage } from "./PendingMessage";
import { StreamingMessage } from "./StreamingMessage";
import { ErrorMessage } from "./ErrorMessage";

function isAssistantMessage(
  msg: CouncilMessage
): msg is CouncilAssistantMessage {
  return msg.role === "assistant";
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-slate-400">
        <p className="text-xl mb-2">Start by asking a question.</p>
        <p className="text-base text-slate-500">
          Multiple AI models will collaborate to provide you with a
          comprehensive answer.
        </p>
      </div>
    </div>
  );
}

/**
 * 짧은 loading 중 깔끔한 UX를 위해 null 반환
 */
function LoadingState() {
  return null;
}

export function MessageList() {
  const {
    messages,
    pendingMessage,
    isProcessing,
    isLoading,
    isInputExpanded,
    error,
    stage1Responses,
    stage2Reviews,
    stage3Synthesis,
  } = useCouncilContext();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Content 변경 시 하단으로 scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [
    messages,
    pendingMessage,
    stage1Responses,
    stage2Reviews,
    stage3Synthesis,
    scrollToBottom,
  ]);

  // Loading state 표시
  if (isLoading) {
    return <LoadingState />;
  }

  // Empty state 표시 (input이 expanded/multiline일 때는 숨김)
  const isEmpty = messages.length === 0 && !pendingMessage && !isProcessing;
  if (isEmpty && error) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorMessage />
      </div>
    );
  }

  // 새/비어있는 session에서만 empty state 표시 (input expansion 중에는 아님)
  if (isEmpty && !isInputExpanded) {
    return <EmptyState />;
  }

  // 비어있지만 input이 expanded되면 null 반환 (사용자가 multiline 입력 중)
  if (isEmpty) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 기존 message */}
      {messages.map((message, index) =>
        message.role === "user" ? (
          <UserMessage key={`user-${index}`} message={message} />
        ) : isAssistantMessage(message) ? (
          <AssistantMessage key={`assistant-${index}`} message={message} />
        ) : null
      )}

      {/* Pending message (확인 대기 중) */}
      <PendingMessage />

      {/* 현재 streaming 중인 message */}
      <StreamingMessage />

      {/* Error message */}
      <ErrorMessage />

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
}
