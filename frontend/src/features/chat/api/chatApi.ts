import { apiClient } from "@/shared";
import type {
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from "../types";

export async function getChatHistory(
  sessionId: string
): Promise<ChatHistoryResponse> {
  const response = await apiClient.get<ChatHistoryResponse>(
    `/api/chat/sessions/${sessionId}/history`
  );
  return response.data;
}

export async function sendChatMessage(
  data: ChatMessageRequest
): Promise<ChatMessageResponse> {
  const { sessionId, message } = data;
  const response = await apiClient.post<ChatMessageResponse>(
    `/api/chat/sessions/${sessionId}/message`,
    { message }
  );
  return response.data;
}
