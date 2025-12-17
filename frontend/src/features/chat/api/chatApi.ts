import axios from "axios";
import { apiClient } from "@/shared";
import type {
  ChatHistoryResponse,
  ChatMessageRequest,
  ChatMessageResponse,
} from "../types";

interface SessionDetailResponse {
  sessionId: string;
  title: string;
  messages: ChatHistoryResponse["messages"];
  createdAt: string;
  updatedAt: string;
}

export async function getChatHistory(
  sessionId: string
): Promise<ChatHistoryResponse> {
  try {
    const response = await apiClient.get<SessionDetailResponse>(
      `/api/chat/sessions/${sessionId}`
    );
    return { messages: response.data.messages };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { messages: [] };
    }
    throw error;
  }
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
