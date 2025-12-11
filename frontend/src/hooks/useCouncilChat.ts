"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  getCouncilSession,
  streamSSE,
  reconnectSSE,
  getCouncilMessageUrl,
  getReconnectUrl,
  getProcessingStatus,
  abortCouncilProcessing,
  StreamError,
} from "@/apis";
import type {
  CouncilMessage,
  CouncilAssistantMessage,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
  SSEEvent,
} from "@/types";

type CurrentStage = "idle" | "stage1" | "stage2" | "stage3";

interface UseCouncilChatReturn {
  messages: CouncilMessage[];
  pendingMessage: string | null;
  currentStage: CurrentStage;
  stage1Responses: Stage1Response[];
  stage1StreamingContent: Record<string, string>;
  stage2Reviews: Stage2Review[];
  stage2StreamingContent: Record<string, string>;
  stage3Synthesis: Stage3Synthesis | null;
  stage3StreamingContent: string;
  stage3ReasoningContent: string;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  isProcessing: boolean;
  isReconnecting: boolean;
  wasAborted: boolean;
  isLoading: boolean;
  error: string | null;
  loadSession: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string, onComplete?: () => void) => void;
  abortProcessing: (sessionId: string) => Promise<void>;
  clearError: () => void;
}

export function useCouncilChat(): UseCouncilChatReturn {
  const [messages, setMessages] = useState<CouncilMessage[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<CurrentStage>("idle");
  const [stage1Responses, setStage1Responses] = useState<Stage1Response[]>([]);
  const [stage1StreamingContent, setStage1StreamingContent] = useState<Record<string, string>>({});
  const [stage2Reviews, setStage2Reviews] = useState<Stage2Review[]>([]);
  const [stage2StreamingContent, setStage2StreamingContent] = useState<Record<string, string>>({});
  const [stage3Synthesis, setStage3Synthesis] =
    useState<Stage3Synthesis | null>(null);
  const [stage3StreamingContent, setStage3StreamingContent] = useState<string>("");
  const [stage3ReasoningContent, setStage3ReasoningContent] = useState<string>("");
  const [labelToModel, setLabelToModel] = useState<Record<string, string>>({});
  const [aggregateRankings, setAggregateRankings] = useState<AggregateRanking[]>(
    []
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [wasAborted, setWasAborted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AbortController for cancelling fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track if component is still mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Reconnect to existing processing (non-streaming: only _response events, chunks ignored)
  const reconnectToProcessing = useCallback(async (sessionId: string) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsReconnecting(true);
    setIsProcessing(true);
    setError(null);

    let tempStage1: Stage1Response[] = [];
    let tempStage2: Stage2Review[] = [];
    let tempStage3: Stage3Synthesis | null = null;

    try {
      const url = getReconnectUrl(sessionId);
      const stream = reconnectSSE(url, abortController.signal);

      for await (const event of stream) {
        switch (event.type) {
          // stage_start: update progress state only
          case "stage1_start":
            setCurrentStage("stage1");
            break;
          case "stage2_start":
            setCurrentStage("stage2");
            break;
          case "stage3_start":
            setCurrentStage("stage3");
            break;

          // chunk events: completely ignored during reconnection
          case "stage1_chunk":
          case "stage2_chunk":
          case "stage3_reasoning_chunk":
          case "stage3_chunk":
            break;

          // _response events: process final results only
          case "stage1_response":
            if (event.data) {
              const response = event.data as Stage1Response;
              tempStage1 = [...tempStage1, response];
              setStage1Responses([...tempStage1]);
            }
            break;

          case "stage1_complete":
            break;

          case "stage2_response":
            if (event.data) {
              const review = event.data as Stage2Review;
              tempStage2 = [...tempStage2, review];
              setStage2Reviews([...tempStage2]);
            }
            break;

          case "stage2_complete":
            if (event.data && "labelToModel" in event.data) {
              setLabelToModel(event.data.labelToModel || {});
              setAggregateRankings(event.data.aggregateRankings || []);
            }
            break;

          case "stage3_response":
            if (event.data) {
              tempStage3 = event.data as Stage3Synthesis;
              setStage3Synthesis(tempStage3);
            }
            break;

          case "title_complete":
            // Title generated during reconnection - will be reflected on next session list load
            break;

          case "reconnected":
            if (event.stage) {
              setCurrentStage(event.stage as CurrentStage);
            }
            if (event.userMessage) {
              setPendingMessage(event.userMessage);
            }
            setIsReconnecting(false);
            break;

          case "complete":
            setCurrentStage("idle");
            setIsProcessing(false);
            setIsReconnecting(false);
            setPendingMessage(null);

            // Add the complete assistant message
            if (tempStage3) {
              const assistantMessage: CouncilAssistantMessage = {
                role: "assistant",
                stage1: tempStage1,
                stage2: tempStage2,
                stage3: tempStage3,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMessage]);
            }
            break;

          case "error":
            setCurrentStage("idle");
            setIsProcessing(false);
            setIsReconnecting(false);
            setError(event.error || "An error occurred");
            break;
        }

        // Exit loop on complete or error
        if (event.type === "complete" || event.type === "error") {
          break;
        }
      }
    } catch (err) {
      // Skip state updates if component unmounted
      if (!isMountedRef.current) return;

      if (err instanceof StreamError) {
        if (err.isAborted) {
          return;
        }
        // 404 means no active processing - this is expected in some cases
        if (err.status === 404) {
          setIsReconnecting(false);
          setIsProcessing(false);
          return;
        }
        setError(err.message);
      } else {
        console.error("Error reconnecting to council stream:", err);
        setError("Failed to reconnect");
      }
      setCurrentStage("idle");
      setIsProcessing(false);
      setIsReconnecting(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    // Abort any in-flight request to prevent cross-session bleed
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset all streaming state when switching sessions
    setCurrentStage("idle");
    setStage1Responses([]);
    setStage1StreamingContent({});
    setStage2Reviews([]);
    setStage2StreamingContent({});
    setStage3Synthesis(null);
    setStage3StreamingContent("");
    setStage3ReasoningContent("");
    setLabelToModel({});
    setAggregateRankings([]);
    setIsProcessing(false);
    setIsReconnecting(false);
    setWasAborted(false);
    setPendingMessage(null);
    setError(null);

    setIsLoading(true);
    try {
      const session = await getCouncilSession(sessionId);
      setMessages(session.messages);
      // Note: Saved aborted messages are rendered in message history, not as "current state"
      // So we don't restore wasAborted/stage*Responses state here

      // Check for active processing and reconnect if needed
      const status = await getProcessingStatus(sessionId);
      if (status.isProcessing && status.canReconnect) {
        console.log(`[Council] Active processing found for session ${sessionId}, reconnecting...`);
        // Don't await - let it run in parallel
        reconnectToProcessing(sessionId);
      }
    } catch (err) {
      console.error("Error loading council session:", err);
      setError("Failed to load session");
    } finally {
      setIsLoading(false);
    }
  }, [reconnectToProcessing]);

  const sendMessage = useCallback((sessionId: string, content: string, onComplete?: () => void) => {
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Reset state for new message
    setCurrentStage("idle");
    setStage1Responses([]);
    setStage1StreamingContent({});
    setStage2Reviews([]);
    setStage2StreamingContent({});
    setStage3Synthesis(null);
    setStage3StreamingContent("");
    setStage3ReasoningContent("");
    setLabelToModel({});
    setAggregateRankings([]);
    setIsProcessing(true);
    setWasAborted(false);
    setError(null);

    // Store pending message (will be added to messages on stage1_start)
    setPendingMessage(content);

    // Temporary storage for building the assistant message
    let tempStage1: Stage1Response[] = [];
    let tempStage2: Stage2Review[] = [];
    let tempStage3: Stage3Synthesis | null = null;
    let userMessageAdded = false;

    // Process SSE stream
    const processStream = async () => {
      try {
        const url = getCouncilMessageUrl(sessionId);
        const stream = streamSSE(url, { content }, abortController.signal);

        for await (const event of stream) {
          switch (event.type) {
            case "stage1_start":
              setCurrentStage("stage1");
              // Add user message now that connection is confirmed
              if (!userMessageAdded) {
                const userMessage: CouncilMessage = {
                  role: "user",
                  content,
                  timestamp: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, userMessage]);
                setPendingMessage(null);
                userMessageAdded = true;
              }
              break;

            case "stage1_chunk":
              // Streaming chunk - accumulate content per model
              if (event.model && event.delta) {
                setStage1StreamingContent((prev) => ({
                  ...prev,
                  [event.model!]: (prev[event.model!] || "") + event.delta,
                }));
              }
              break;

            case "stage1_model_complete":
              // Model finished streaming - metadata available
              // Content is already accumulated via chunks
              break;

            case "stage1_response":
              // Final response - clear streaming content for this model
              if (event.data) {
                const response = event.data as Stage1Response;
                tempStage1 = [...tempStage1, response];
                setStage1Responses([...tempStage1]);
                // Remove from streaming content
                setStage1StreamingContent((prev) => {
                  const next = { ...prev };
                  delete next[response.model];
                  return next;
                });
              }
              break;

            case "stage1_complete":
              // Stage 1 done - clear any remaining streaming content
              setStage1StreamingContent({});
              break;

            case "stage2_start":
              setCurrentStage("stage2");
              break;

            case "stage2_chunk":
              // Streaming chunk - accumulate content per model
              if (event.model && event.delta) {
                setStage2StreamingContent((prev) => ({
                  ...prev,
                  [event.model!]: (prev[event.model!] || "") + event.delta,
                }));
              }
              break;

            case "stage2_model_complete":
              // Model finished streaming - metadata available
              break;

            case "stage2_response":
              // Final response - clear streaming content for this model
              if (event.data) {
                const review = event.data as Stage2Review;
                tempStage2 = [...tempStage2, review];
                setStage2Reviews([...tempStage2]);
                // Remove from streaming content
                setStage2StreamingContent((prev) => {
                  const next = { ...prev };
                  delete next[review.model];
                  return next;
                });
              }
              break;

            case "stage2_complete":
              // Stage 2 done - clear any remaining streaming content
              setStage2StreamingContent({});
              if (event.data && "labelToModel" in event.data) {
                setLabelToModel(event.data.labelToModel || {});
                setAggregateRankings(event.data.aggregateRankings || []);
              }
              break;

            case "stage3_start":
              setCurrentStage("stage3");
              break;

            case "stage3_reasoning_chunk":
              // Reasoning chunk - accumulate reasoning content
              if (event.delta) {
                setStage3ReasoningContent((prev) => prev + event.delta);
              }
              break;

            case "stage3_chunk":
              // Streaming chunk - accumulate content
              if (event.delta) {
                setStage3StreamingContent((prev) => prev + event.delta);
              }
              break;

            case "stage3_response":
              // Final response - clear streaming content
              setStage3StreamingContent("");
              setStage3ReasoningContent("");
              if (event.data) {
                tempStage3 = event.data as Stage3Synthesis;
                setStage3Synthesis(tempStage3);
              }
              break;

            case "title_complete":
              // Title generated - refresh sidebar to show new title
              onComplete?.();
              break;

            case "complete":
              setCurrentStage("idle");
              setIsProcessing(false);

              // Add the complete assistant message
              if (tempStage3) {
                const assistantMessage: CouncilAssistantMessage = {
                  role: "assistant",
                  stage1: tempStage1,
                  stage2: tempStage2,
                  stage3: tempStage3,
                  timestamp: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
              }

              // Notify caller that processing is complete (e.g., to refresh sidebar)
              onComplete?.();
              break;

            case "error":
              setCurrentStage("idle");
              setIsProcessing(false);
              setPendingMessage(null);
              setError(event.error || "An error occurred");
              break;
          }
        }
      } catch (err) {
        // Handle errors - skip state updates if component unmounted
        if (!isMountedRef.current) return;

        if (err instanceof StreamError) {
          if (err.isAborted) {
            // Request was intentionally aborted, no error to show
            return;
          }
          setError(err.message);
        } else {
          console.error("Error in council stream:", err);
          setError("Connection lost");
        }
        setCurrentStage("idle");
        setIsProcessing(false);
        setPendingMessage(null);
      }
    };

    processStream();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const abortProcessing = useCallback(async (sessionId: string) => {
    // 1. Abort local SSE connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. Explicitly tell backend to abort
    try {
      await abortCouncilProcessing(sessionId);
    } catch {
      // Ignore - processing may have already completed
    }

    // 3. Update UI state
    setCurrentStage("idle");
    setIsProcessing(false);
    setWasAborted(true);
    setPendingMessage(null);
  }, []);

  return {
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
    loadSession,
    sendMessage,
    abortProcessing,
    clearError,
  };
}
