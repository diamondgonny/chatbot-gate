/**
 * Council Context Provider
 * Provides council state and actions to all child components
 *
 * Uses split contexts for state management to enable render optimization:
 * - CouncilMessagesContext for messages
 * - CouncilStreamContext for stream state
 * - CouncilStatusContext for status flags
 */

"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import type { CouncilMessage, CouncilAssistantMessage, CouncilMode } from "../domain";
import type { CurrentStage } from "../domain";
import type { CouncilState } from "./useCouncilState";
import { useCouncilStream } from "./useCouncilStream";
import {
  getCouncilSession,
  getProcessingStatus,
  abortCouncilProcessing,
} from "../services";
import { useCouncilMessagesContext } from "./CouncilMessagesContext";
import { useCouncilStreamContext } from "./CouncilStreamContext";
import { useCouncilStatusContext } from "./CouncilStatusContext";

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
    mode?: CouncilMode,
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
 *
 * Uses split contexts for state management - must be nested inside:
 * - CouncilMessagesProvider
 * - CouncilStreamProvider
 * - CouncilStatusProvider
 */
export function CouncilProvider({ children }: CouncilProviderProps) {
  // Use split contexts for state management (render optimization)
  const messagesContext = useCouncilMessagesContext();
  const streamContext = useCouncilStreamContext();
  const statusContext = useCouncilStatusContext();

  // Track current session for race condition prevention
  const loadSessionIdRef = useRef<string | null>(null);
  const loadAbortControllerRef = useRef<AbortController | null>(null);

  // Store onComplete callback for title_complete events
  const onCompleteCallbackRef = useRef<(() => void) | undefined>(undefined);

  // Destructure stable setters from split contexts to avoid dependency issues
  const { setMessages, setPendingMessage } = messagesContext;
  const { updateStreamState, resetStreamState } = streamContext;
  const {
    setProcessing,
    setReconnecting,
    setAborted,
    setLoading,
    setError,
    setInputExpanded,
  } = statusContext;

  // Create stream callbacks using stable setter references
  const streamCallbacks = useMemo(
    () => ({
      onStateChange: updateStreamState,
      onUserMessageConfirmed: (content: string) => {
        const userMessage: CouncilMessage = {
          role: "user",
          content,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMessage]);
        setPendingMessage(null);
      },
      onComplete: (assistantMessage: CouncilAssistantMessage) => {
        setMessages((prev) => [...prev, assistantMessage]);
        setPendingMessage(null); // Clear pending message (including reconnection case)
        onCompleteCallbackRef.current?.();
      },
      onError: (error: string) => {
        setError(error);
        setPendingMessage(null);
      },
      onTitleComplete: () => {
        onCompleteCallbackRef.current?.();
      },
      onReconnected: (stage: CurrentStage, userMessage?: string) => {
        updateStreamState({ currentStage: stage });
        if (userMessage) {
          setPendingMessage(userMessage);
        }
        setReconnecting(false);
      },
      onProcessingStart: () => {
        setProcessing(true);
        setAborted(false);
        setError(null);
      },
      onProcessingEnd: () => {
        setProcessing(false);
        setReconnecting(false);
      },
    }),
    [
      updateStreamState,
      setMessages,
      setPendingMessage,
      setError,
      setReconnecting,
      setProcessing,
      setAborted,
    ]
  );

  const { startStream, reconnectStream, abortStream } =
    useCouncilStream(streamCallbacks);

  // Cleanup in-flight requests/streams on unmount
  useEffect(() => {
    return () => {
      loadAbortControllerRef.current?.abort();
      loadAbortControllerRef.current = null;
      loadSessionIdRef.current = null;
      onCompleteCallbackRef.current = undefined;
      abortStream();
    };
  }, [abortStream]);

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

      // Set loading state - LoadingState will hide any existing content
      setLoading(true);

      // Reset stream state (no visual impact while loading)
      resetStreamState();

      // Reset status flags
      setProcessing(false);
      setReconnecting(false);
      setAborted(false);
      setError(null);
      setInputExpanded(false);

      // NOTE: Don't clear messages here - they're hidden by LoadingState anyway
      // Clearing causes a flash of EmptyState due to split context update timing

      try {
        const session = await getCouncilSession(sessionId, controller.signal);

        // Skip if session changed (race condition)
        if (loadSessionIdRef.current !== sessionId) {
          return;
        }

        // Replace messages directly (handles both empty and non-empty sessions)
        setMessages(session.messages);

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
          setReconnecting(true);
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
          setError("Failed to load session");
        }
      } finally {
        // Only update loading state if still on the same session
        if (loadSessionIdRef.current === sessionId) {
          setLoading(false);
        }
      }
    },
    [abortStream, reconnectStream, resetStreamState, setMessages, setLoading, setProcessing, setReconnecting, setAborted, setError, setInputExpanded]
  );

  /**
   * Send a message to the council
   */
  const sendMessage = useCallback(
    (sessionId: string, content: string, mode: CouncilMode = 'ultra', onComplete?: () => void) => {
      // Store callback for later use
      onCompleteCallbackRef.current = onComplete;

      // Reset stream state
      resetStreamState();
      setPendingMessage(content);

      // Start streaming with mode
      startStream(sessionId, content, mode);
    },
    [startStream, resetStreamState, setPendingMessage]
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
      updateStreamState({ currentStage: "idle" });
      setProcessing(false);
      setAborted(true);
      setPendingMessage(null);
    },
    [abortStream, updateStreamState, setProcessing, setAborted, setPendingMessage]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  // Build state object from split contexts (use individual values, not context objects)
  const { messages, pendingMessage } = messagesContext;
  const {
    currentStage,
    stage1Responses,
    stage1StreamingContent,
    stage2Reviews,
    stage2StreamingContent,
    stage3Synthesis,
    stage3StreamingContent,
    stage3ReasoningContent,
    labelToModel,
    aggregateRankings,
  } = streamContext;
  const { isProcessing, isReconnecting, wasAborted, isLoading, error, isInputExpanded } =
    statusContext;

  const state: CouncilState = useMemo(
    () => ({
      // Messages
      messages,
      pendingMessage,
      // Stream
      currentStage,
      stage1Responses,
      stage1StreamingContent,
      stage2Reviews,
      stage2StreamingContent,
      stage3Synthesis,
      stage3StreamingContent,
      stage3ReasoningContent,
      labelToModel,
      aggregateRankings,
      // Status
      isProcessing,
      isReconnecting,
      wasAborted,
      isLoading,
      error,
      isInputExpanded,
    }),
    [
      messages,
      pendingMessage,
      currentStage,
      stage1Responses,
      stage1StreamingContent,
      stage2Reviews,
      stage2StreamingContent,
      stage3Synthesis,
      stage3StreamingContent,
      stage3ReasoningContent,
      labelToModel,
      aggregateRankings,
      isProcessing,
      isReconnecting,
      wasAborted,
      isLoading,
      error,
      isInputExpanded,
    ]
  );

  // Build context value
  const contextValue: CouncilContextValue = useMemo(
    () => ({
      ...state,
      loadSession,
      sendMessage,
      abortProcessing,
      clearError,
      setInputExpanded,
    }),
    [state, loadSession, sendMessage, abortProcessing, clearError, setInputExpanded]
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
