/**
 * Message List Component
 * Main container for displaying all messages in a council chat
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

/**
 * Type guard for assistant messages
 */
function isAssistantMessage(
  msg: CouncilMessage
): msg is CouncilAssistantMessage {
  return msg.role === "assistant";
}

/**
 * Empty state component
 */
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
 * Loading state component - returns null for clean UX during brief loading
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

  // Scroll to bottom when content changes
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

  // Show loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Show empty state (hide when input is expanded/multiline)
  const isEmpty = messages.length === 0 && !pendingMessage && !isProcessing;
  if (isEmpty && error) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorMessage />
      </div>
    );
  }

  // Show empty state only for new/empty sessions (not during input expansion)
  if (isEmpty && !isInputExpanded) {
    return <EmptyState />;
  }

  // Return null when empty but input is expanded (user typing multiline)
  if (isEmpty) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Existing messages */}
      {messages.map((message, index) =>
        message.role === "user" ? (
          <UserMessage key={`user-${index}`} message={message} />
        ) : isAssistantMessage(message) ? (
          <AssistantMessage key={`assistant-${index}`} message={message} />
        ) : null
      )}

      {/* Pending message (waiting for confirmation) */}
      <PendingMessage />

      {/* Current streaming message */}
      <StreamingMessage />

      {/* Error message */}
      <ErrorMessage />

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
}
