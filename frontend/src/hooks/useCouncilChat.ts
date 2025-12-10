"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { getCouncilSession, streamSSE, getCouncilMessageUrl, StreamError } from "@/apis";
import type {
  CouncilMessage,
  CouncilAssistantMessage,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
} from "@/types";

type CurrentStage = "idle" | "stage1" | "stage2" | "stage3";

interface UseCouncilChatReturn {
  messages: CouncilMessage[];
  pendingMessage: string | null;
  currentStage: CurrentStage;
  stage1Responses: Stage1Response[];
  stage2Reviews: Stage2Review[];
  stage3Synthesis: Stage3Synthesis | null;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  isProcessing: boolean;
  isLoading: boolean;
  error: string | null;
  loadSession: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string) => void;
  clearError: () => void;
}

export function useCouncilChat(): UseCouncilChatReturn {
  const [messages, setMessages] = useState<CouncilMessage[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<CurrentStage>("idle");
  const [stage1Responses, setStage1Responses] = useState<Stage1Response[]>([]);
  const [stage2Reviews, setStage2Reviews] = useState<Stage2Review[]>([]);
  const [stage3Synthesis, setStage3Synthesis] =
    useState<Stage3Synthesis | null>(null);
  const [labelToModel, setLabelToModel] = useState<Record<string, string>>({});
  const [aggregateRankings, setAggregateRankings] = useState<AggregateRanking[]>(
    []
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AbortController for cancelling fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
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
    setStage2Reviews([]);
    setStage3Synthesis(null);
    setLabelToModel({});
    setAggregateRankings([]);
    setIsProcessing(false);
    setPendingMessage(null);
    setError(null);

    setIsLoading(true);
    try {
      const session = await getCouncilSession(sessionId);
      setMessages(session.messages);
    } catch (err) {
      console.error("Error loading council session:", err);
      setError("Failed to load session");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback((sessionId: string, content: string) => {
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
    setStage2Reviews([]);
    setStage3Synthesis(null);
    setLabelToModel({});
    setAggregateRankings([]);
    setIsProcessing(true);
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

            case "stage1_response":
              if (event.data) {
                tempStage1 = [...tempStage1, event.data as Stage1Response];
                setStage1Responses([...tempStage1]);
              }
              break;

            case "stage1_complete":
              // Stage 1 done
              break;

            case "stage2_start":
              setCurrentStage("stage2");
              break;

            case "stage2_response":
              if (event.data) {
                tempStage2 = [...tempStage2, event.data as Stage2Review];
                setStage2Reviews([...tempStage2]);
              }
              break;

            case "stage2_complete":
              if (event.data && "labelToModel" in event.data) {
                setLabelToModel(event.data.labelToModel || {});
                setAggregateRankings(event.data.aggregateRankings || []);
              }
              break;

            case "stage3_start":
              setCurrentStage("stage3");
              break;

            case "stage3_response":
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

  return {
    messages,
    pendingMessage,
    currentStage,
    stage1Responses,
    stage2Reviews,
    stage3Synthesis,
    labelToModel,
    aggregateRankings,
    isProcessing,
    isLoading,
    error,
    loadSession,
    sendMessage,
    clearError,
  };
}
