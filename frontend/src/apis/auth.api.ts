import apiClient from "./client";
import type {
  AuthStatusResponse,
  GateValidateRequest,
  GateValidateResponse,
} from "@/types";

export async function checkAuthStatus(): Promise<AuthStatusResponse> {
  const response = await apiClient.get<AuthStatusResponse>("/api/auth/status");
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
