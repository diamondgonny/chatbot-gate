import { apiClient } from "@/shared";
import type {
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from "../domain";

export async function getChatHistory(
  sessionId: string
): Promise<ChatHistoryResponse> {
  const response = await apiClient.get<ChatHistoryResponse>(
    "/api/chat/history",
    { params: { sessionId } }
  );
  return response.data;
}

export async function sendChatMessage(
  data: ChatMessageRequest
): Promise<ChatMessageResponse> {
  const response = await apiClient.post<ChatMessageResponse>(
    "/api/chat/message",
    data
  );
  return response.data;
}
