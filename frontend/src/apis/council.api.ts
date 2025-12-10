import apiClient from "./client";
import type {
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "@/types";

// Re-export streaming utilities for council message handling
export { streamSSE, reconnectSSE, getCouncilMessageUrl, getReconnectUrl, StreamError } from "@/utils/streamUtils";

export async function createCouncilSession(): Promise<CreateCouncilSessionResponse> {
  const response = await apiClient.post<CreateCouncilSessionResponse>(
    "/api/council/sessions"
  );
  return response.data;
}

export async function getCouncilSessions(): Promise<GetCouncilSessionsResponse> {
  const response = await apiClient.get<GetCouncilSessionsResponse>(
    "/api/council/sessions"
  );
  return response.data;
}

export async function getCouncilSession(
  sessionId: string
): Promise<GetCouncilSessionResponse> {
  const response = await apiClient.get<GetCouncilSessionResponse>(
    `/api/council/sessions/${sessionId}`
  );
  return response.data;
}

export async function deleteCouncilSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/api/council/sessions/${sessionId}`);
}

export async function getProcessingStatus(sessionId: string): Promise<ProcessingStatus> {
  const response = await apiClient.get<ProcessingStatus>(
    `/api/council/sessions/${sessionId}/status`
  );
  return response.data;
}
