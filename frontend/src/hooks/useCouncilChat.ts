"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { getCouncilSession, getCouncilMessageUrl } from "@/apis";
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

  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
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
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Reset state for new message
    setCurrentStage("idle");
    setStage1Responses([]);
    setStage2Reviews([]);
    setStage3Synthesis(null);
    setLabelToModel({});
    setAggregateRankings([]);
    setIsProcessing(true);
    setError(null);

    // Add user message immediately
    const userMessage: CouncilMessage = {
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Create SSE connection
    const url = getCouncilMessageUrl(sessionId, content);
    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    // Temporary storage for building the assistant message
    let tempStage1: Stage1Response[] = [];
    let tempStage2: Stage2Review[] = [];
    let tempStage3: Stage3Synthesis | null = null;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "stage1_start":
            setCurrentStage("stage1");
            break;

          case "stage1_response":
            tempStage1 = [...tempStage1, data.data];
            setStage1Responses([...tempStage1]);
            break;

          case "stage1_complete":
            // Stage 1 done
            break;

          case "stage2_start":
            setCurrentStage("stage2");
            break;

          case "stage2_response":
            tempStage2 = [...tempStage2, data.data];
            setStage2Reviews([...tempStage2]);
            break;

          case "stage2_complete":
            if (data.data) {
              setLabelToModel(data.data.labelToModel || {});
              setAggregateRankings(data.data.aggregateRankings || []);
            }
            break;

          case "stage3_start":
            setCurrentStage("stage3");
            break;

          case "stage3_response":
            tempStage3 = data.data;
            setStage3Synthesis(data.data);
            break;

          case "complete":
            eventSource.close();
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
            eventSource.close();
            setCurrentStage("idle");
            setIsProcessing(false);
            setError(data.error || "An error occurred");
            break;
        }
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setCurrentStage("idle");
      setIsProcessing(false);
      setError("Connection lost");
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
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
