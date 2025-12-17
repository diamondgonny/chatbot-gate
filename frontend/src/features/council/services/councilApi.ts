/**
 * Council API Service
 * Council backend와의 모든 HTTP 통신 처리
 */

import { apiClient } from "@/shared";
import type {
  CreateCouncilSessionResponse,
  GetCouncilSessionsResponse,
  GetCouncilSessionResponse,
  ProcessingStatus,
} from "../domain";

/**
 * API 호출용 base URL
 */
const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * SSE streaming용 council message URL 생성
 */
export function getCouncilMessageUrl(sessionId: string): string {
  return `${getBaseUrl()}/api/council/sessions/${sessionId}/message`;
}

/**
 * SSE 재연결용 council reconnect URL 생성
 */
export function getReconnectUrl(sessionId: string): string {
  return `${getBaseUrl()}/api/council/sessions/${sessionId}/reconnect`;
}

/**
 * 새 council session 생성
 */
export async function createCouncilSession(): Promise<CreateCouncilSessionResponse> {
  const response = await apiClient.post<CreateCouncilSessionResponse>(
    "/api/council/sessions"
  );
  return response.data;
}

/**
 * 현재 사용자의 모든 council session 조회
 */
export async function getCouncilSessions(
  signal?: AbortSignal
): Promise<GetCouncilSessionsResponse> {
  const response = await apiClient.get<GetCouncilSessionsResponse>(
    "/api/council/sessions",
    { signal }
  );
  return response.data;
}

/**
 * 특정 council session과 message 조회
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
 * Council session 삭제
 */
export async function deleteCouncilSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/api/council/sessions/${sessionId}`);
}

/**
 * Council session의 처리 상태 조회
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
 * 진행 중인 council 처리 중단
 */
export async function abortCouncilProcessing(sessionId: string): Promise<void> {
  await apiClient.post(`/api/council/sessions/${sessionId}/abort`);
}
