import apiClient from "./client";
import type {
  AuthStatusResponse,
  GateValidateRequest,
  GateValidateResponse,
} from "../types";

export async function checkAuthStatus(
  signal?: AbortSignal
): Promise<AuthStatusResponse> {
  const response = await apiClient.get<AuthStatusResponse>("/api/auth/status", {
    signal,
  });
  return response.data;
}

export async function validateGateCode(
  data: GateValidateRequest
): Promise<GateValidateResponse> {
  const response = await apiClient.post<GateValidateResponse>(
    "/api/gate/validate",
    data
  );
  return response.data;
}
