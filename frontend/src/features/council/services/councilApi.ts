/**
 * Council API Service
 * Handles all HTTP communication with the council backend
 */

import { apiClient } from "@/shared";
import type {
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "../domain";

/**
 * Base URL for API calls
 */
const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * Build the council message URL for SSE streaming
 */
export function getCouncilMessageUrl(sessionId: string): string {
  return `${getBaseUrl()}/api/council/sessions/${sessionId}/message`;
}

/**
 * Build the council reconnect URL for SSE reconnection
 */
export function getReconnectUrl(sessionId: string): string {
  return `${getBaseUrl()}/api/council/sessions/${sessionId}/reconnect`;
}

/**
 * Create a new council session
 */
export async function createCouncilSession(): Promise<CreateCouncilSessionResponse> {
  const response = await apiClient.post<CreateCouncilSessionResponse>(
    "/api/council/sessions"
  );
  return response.data;
}

/**
 * Get all council sessions for the current user
 */
export async function getCouncilSessions(): Promise<GetCouncilSessionsResponse> {
  const response = await apiClient.get<GetCouncilSessionsResponse>(
    "/api/council/sessions"
  );
  return response.data;
}

/**
 * Get a specific council session with messages
 */
export async function getCouncilSession(
  sessionId: string,
  signal?: AbortSignal
): Promise<GetCouncilSessionResponse> {
  const response = await apiClient.get<GetCouncilSessionResponse>(
    `/api/council/sessions/${sessionId}`,
    { signal }
  );
  return response.data;
}

/**
 * Delete a council session
 */
export async function deleteCouncilSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/api/council/sessions/${sessionId}`);
}

/**
 * Get the processing status of a council session
 */
export async function getProcessingStatus(
  sessionId: string,
  signal?: AbortSignal
): Promise<ProcessingStatus> {
  const response = await apiClient.get<ProcessingStatus>(
    `/api/council/sessions/${sessionId}/status`,
    { signal }
  );
  return response.data;
}

/**
 * Abort ongoing council processing
 */
export async function abortCouncilProcessing(sessionId: string): Promise<void> {
  await apiClient.post(`/api/council/sessions/${sessionId}/abort`);
}
