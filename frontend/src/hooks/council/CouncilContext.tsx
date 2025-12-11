/**
 * Council Context Provider
 * Provides council state and actions to all child components
 */

"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { CouncilMessage, CouncilAssistantMessage } from "@/types";
import type { CurrentStage } from "@/domain/council";
import { useCouncilState, type CouncilState } from "./useCouncilState";
import { useCouncilStream } from "./useCouncilStream";
import {
  getCouncilSession,
  getProcessingStatus,
  abortCouncilProcessing,
} from "@/services/council";

// Treat both DOM aborts and axios cancellations as benign
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "CanceledError") {
      return true;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ERR_CANCELED"
  ) {
    return true;
  }

  return false;
}

/**
 * Council context value shape
 */
export interface CouncilContextValue extends CouncilState {
  // Session actions
  loadSession: (sessionId: string) => Promise<void>;
  sendMessage: (
    sessionId: string,
    content: string,
    onComplete?: () => void
  ) => void;
  abortProcessing: (sessionId: string) => Promise<void>;
  clearError: () => void;
  setInputExpanded: (isExpanded: boolean) => void;
}

// Create context with undefined default (must be used within provider)
const CouncilContext = createContext<CouncilContextValue | undefined>(
  undefined
);

/**
 * Props for CouncilProvider
 */
interface CouncilProviderProps {
  children: ReactNode;
}

/**
 * Council Provider component
 * Wraps children with council state and actions
 */
export function CouncilProvider({ children }: CouncilProviderProps) {
  const [state, actions] = useCouncilState();

  // Track current session for race condition prevention
  const loadSessionIdRef = useRef<string | null>(null);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  // Store onComplete callback for title_complete events
  let onCompleteCallback: (() => void) | undefined;

  // Create stream callbacks
  const streamCallbacks = useMemo(
    () => ({
      onStateChange: actions.updateStreamState,
      onUserMessageConfirmed: (content: string) => {
        const userMessage: CouncilMessage = {
          role: "user",
          content,
          timestamp: new Date().toISOString(),
        };
        actions.setMessages((prev) => [...prev, userMessage]);
        actions.setPendingMessage(null);
      },
      onComplete: (assistantMessage: CouncilAssistantMessage) => {
        actions.setMessages((prev) => [...prev, assistantMessage]);
        actions.setPendingMessage(null); // Clear pending message (including reconnection case)
        onCompleteCallback?.();
      },
      onError: (error: string) => {
        actions.setError(error);
        actions.setPendingMessage(null);
      },
      onTitleComplete: () => {
        onCompleteCallback?.();
      },
      onReconnected: (stage: CurrentStage, userMessage?: string) => {
        actions.updateStreamState({ currentStage: stage });
        if (userMessage) {
          actions.setPendingMessage(userMessage);
        }
        actions.setReconnecting(false);
      },
      onProcessingStart: () => {
        actions.setProcessing(true);
        actions.setAborted(false);
        actions.setError(null);
      },
      onProcessingEnd: () => {
        actions.setProcessing(false);
        actions.setReconnecting(false);
      },
    }),
    [actions]
  );

  const { startStream, reconnectStream, abortStream } =
    useCouncilStream(streamCallbacks);

  /**
   * Load a council session
   */
  const loadSession = useCallback(
    async (sessionId: string) => {
      // Cancel previous in-flight request (race condition prevention)
      loadAbortControllerRef.current?.abort();
      const controller = new AbortController();
      loadAbortControllerRef.current = controller;

      // Track current session ID
      loadSessionIdRef.current = sessionId;

      // Abort any in-flight SSE stream
      abortStream();

      // Reset all state
      actions.resetAll();
      actions.setLoading(true);

      try {
        const session = await getCouncilSession(sessionId, controller.signal);

        // Skip if session changed (race condition)
        if (loadSessionIdRef.current !== sessionId) {
          return;
        }

        actions.setMessages(session.messages);

        // Check for active processing and reconnect if needed
        const status = await getProcessingStatus(sessionId, controller.signal);

        // Skip if session changed (race condition)
        if (loadSessionIdRef.current !== sessionId) {
          return;
        }

        if (status.isProcessing && status.canReconnect) {
          console.log(
            `[Council] Active processing found for session ${sessionId}, reconnecting...`
          );
          actions.setReconnecting(true);
          reconnectStream(sessionId);
        }
      } catch (err) {
        // Ignore intentional cancellations (AbortController/axios)
        if (isAbortError(err)) {
          return;
        }

        console.error("Error loading council session:", err);

        // Only set error if still on the same session
        if (loadSessionIdRef.current === sessionId) {
          actions.setError("Failed to load session");
        }
      } finally {
        // Only update loading state if still on the same session
        if (loadSessionIdRef.current === sessionId) {
          actions.setLoading(false);
        }
      }
    },
    [abortStream, reconnectStream, actions]
  );

  /**
   * Send a message to the council
   */
  const sendMessage = useCallback(
    (sessionId: string, content: string, onComplete?: () => void) => {
      // Store callback for later use
      onCompleteCallback = onComplete;

      // Reset stream state
      actions.resetStreamState();
      actions.setPendingMessage(content);

      // Start streaming
      startStream(sessionId, content);
    },
    [startStream, actions]
  );

  /**
   * Abort ongoing processing
   */
  const abortProcessing = useCallback(
    async (sessionId: string) => {
      // 1. Abort local SSE connection
      abortStream();

      // 2. Tell backend to abort
      try {
        await abortCouncilProcessing(sessionId);
      } catch {
        // Ignore - processing may have already completed
      }

      // 3. Update UI state
      actions.updateStreamState({ currentStage: "idle" });
      actions.setProcessing(false);
      actions.setAborted(true);
      actions.setPendingMessage(null);
    },
    [abortStream, actions]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    actions.setError(null);
  }, [actions]);

  // Build context value
  const contextValue: CouncilContextValue = useMemo(
    () => ({
      ...state,
      loadSession,
      sendMessage,
      abortProcessing,
      clearError,
      setInputExpanded: actions.setInputExpanded,
    }),
    [state, loadSession, sendMessage, abortProcessing, clearError, actions.setInputExpanded]
  );

  return (
    <CouncilContext.Provider value={contextValue}>
      {children}
    </CouncilContext.Provider>
  );
}

/**
 * Hook to access council context
 * Must be used within a CouncilProvider
 */
export function useCouncilContext(): CouncilContextValue {
  const context = useContext(CouncilContext);
  if (context === undefined) {
    throw new Error("useCouncilContext must be used within a CouncilProvider");
  }
  return context;
}
