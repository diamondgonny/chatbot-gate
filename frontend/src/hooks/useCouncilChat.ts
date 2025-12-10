"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  getCouncilSession,
  streamSSE,
  reconnectSSE,
  getCouncilMessageUrl,
  getReconnectUrl,
  getProcessingStatus,
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
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  isProcessing: boolean;
  isReconnecting: boolean;
  wasAborted: boolean;
  isLoading: boolean;
  error: string | null;
  loadSession: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string, onComplete?: () => void) => void;
  abortProcessing: () => void;
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

  // Track stalled stages during reconnection (chunks for these stages are ignored)
  // Using ref for synchronous access during event processing
  // Set allows multiple stages to be stalled simultaneously during replay
  const stalledStagesRef = useRef<Set<CurrentStage>>(new Set());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Helper function to process SSE events (shared between sendMessage and reconnect)
  const processSSEEvent = useCallback((
    event: SSEEvent,
    tempStage1: Stage1Response[],
    tempStage2: Stage2Review[]
  ): { tempStage1: Stage1Response[]; tempStage2: Stage2Review[]; tempStage3: Stage3Synthesis | null } => {
    let tempStage3: Stage3Synthesis | null = null;

    switch (event.type) {
      case "stage1_start":
        setCurrentStage("stage1");
        break;

      case "stage1_chunk":
        // Skip chunks if stage1 is stalled (reconnection replay scenario)
        if (stalledStagesRef.current.has("stage1")) break;
        if (event.model && event.delta) {
          setStage1StreamingContent((prev) => ({
            ...prev,
            [event.model!]: (prev[event.model!] || "") + event.delta,
          }));
        }
        break;

      case "stage1_response":
        if (event.data) {
          const response = event.data as Stage1Response;
          tempStage1 = [...tempStage1, response];
          setStage1Responses([...tempStage1]);
          setStage1StreamingContent((prev) => {
            const next = { ...prev };
            delete next[response.model];
            return next;
          });
        }
        break;

      case "stage1_complete":
        setStage1StreamingContent({});
        break;

      case "stage2_start":
        setCurrentStage("stage2");
        break;

      case "stage2_chunk":
        // Skip chunks if stage2 is stalled (reconnection replay scenario)
        if (stalledStagesRef.current.has("stage2")) break;
        if (event.model && event.delta) {
          setStage2StreamingContent((prev) => ({
            ...prev,
            [event.model!]: (prev[event.model!] || "") + event.delta,
          }));
        }
        break;

      case "stage2_response":
        if (event.data) {
          const review = event.data as Stage2Review;
          tempStage2 = [...tempStage2, review];
          setStage2Reviews([...tempStage2]);
          setStage2StreamingContent((prev) => {
            const next = { ...prev };
            delete next[review.model];
            return next;
          });
        }
        break;

      case "stage2_complete":
        setStage2StreamingContent({});
        if (event.data && "labelToModel" in event.data) {
          setLabelToModel(event.data.labelToModel || {});
          setAggregateRankings(event.data.aggregateRankings || []);
        }
        break;

      case "stage3_start":
        setCurrentStage("stage3");
        break;

      case "stage3_chunk":
        // Skip chunks if stage3 is stalled (reconnection replay scenario)
        if (stalledStagesRef.current.has("stage3")) break;
        if (event.delta) {
          setStage3StreamingContent((prev) => prev + event.delta);
        }
        break;

      case "stage3_response":
        setStage3StreamingContent("");
        if (event.data) {
          tempStage3 = event.data as Stage3Synthesis;
          setStage3Synthesis(tempStage3);
        }
        break;

      case "reconnected":
        // Set current stage from server's tracking
        if (event.stage) {
          setCurrentStage(event.stage as CurrentStage);
          // Clear stall for FUTURE stages only (they can stream normally)
          // Current and past stages remain stalled to prevent duplicate replay
          if (event.stage === "stage1") {
            stalledStagesRef.current.delete("stage2");
            stalledStagesRef.current.delete("stage3");
          } else if (event.stage === "stage2") {
            stalledStagesRef.current.delete("stage3");
          }
          // stage3: no future stages, keep all stalls
        }
        // Set userMessage as pendingMessage to display the user bubble
        if (event.userMessage) {
          setPendingMessage(event.userMessage);
        }
        setIsReconnecting(false);
        break;

      case "error":
        setCurrentStage("idle");
        setIsProcessing(false);
        setIsReconnecting(false);
        setError(event.error || "An error occurred");
        break;
    }

    return { tempStage1, tempStage2, tempStage3 };
  }, []);

  // Reconnect to existing processing
  const reconnectToProcessing = useCallback(async (sessionId: string) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsReconnecting(true);
    setIsProcessing(true);
    setError(null);

    // Stall all stages at reconnection start
    // Replay chunks will be skipped; only stage_start events clear the stall
    stalledStagesRef.current = new Set(["stage1", "stage2", "stage3"]);

    let tempStage1: Stage1Response[] = [];
    let tempStage2: Stage2Review[] = [];
    let tempStage3: Stage3Synthesis | null = null;

    try {
      const url = getReconnectUrl(sessionId);
      const stream = reconnectSSE(url, abortController.signal);

      for await (const event of stream) {
        const result = processSSEEvent(event, tempStage1, tempStage2);
        tempStage1 = result.tempStage1;
        tempStage2 = result.tempStage2;
        if (result.tempStage3) tempStage3 = result.tempStage3;

        if (event.type === "complete") {
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
        }
      }
    } catch (err) {
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
  }, [processSSEEvent]);

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
    setLabelToModel({});
    setAggregateRankings([]);
    setIsProcessing(false);
    setIsReconnecting(false);
    setWasAborted(false);
    setPendingMessage(null);
    setError(null);
    stalledStagesRef.current.clear();

    setIsLoading(true);
    try {
      const session = await getCouncilSession(sessionId);
      setMessages(session.messages);

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
    setLabelToModel({});
    setAggregateRankings([]);
    setIsProcessing(true);
    setWasAborted(false);
    setError(null);
    stalledStagesRef.current.clear();

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

            case "stage3_chunk":
              // Streaming chunk - accumulate content
              if (event.delta) {
                setStage3StreamingContent((prev) => prev + event.delta);
              }
              break;

            case "stage3_response":
              // Final response - clear streaming content
              setStage3StreamingContent("");
              if (event.data) {
                tempStage3 = event.data as Stage3Synthesis;
                setStage3Synthesis(tempStage3);
              }
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
        // Handle errors
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

  const abortProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
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
