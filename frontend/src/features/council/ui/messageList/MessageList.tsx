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
 * Loading state component
 */
function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full text-slate-400">
      <span className="animate-spin mr-2">⏳</span> Loading session...
    </div>
  );
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  if (isEmpty && !isInputExpanded) {
    return <EmptyState />;
  }

  // Return null when empty but input is expanded
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
