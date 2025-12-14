import { apiClient } from "@/shared";
import type { SessionsResponse, CreateSessionResponse } from "../domain";

export async function getSessions(): Promise<SessionsResponse> {
  const response = await apiClient.get<SessionsResponse>("/api/chat/sessions");
  return response.data;
}

export async function createSession(): Promise<CreateSessionResponse> {
  const response = await apiClient.post<CreateSessionResponse>(
    "/api/chat/sessions",
    {}
  );
  return response.data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/api/chat/sessions/${sessionId}`);
}
