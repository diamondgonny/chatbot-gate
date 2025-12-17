/**
 * Auth types (공유 관심사)
 */
export interface AuthStatusResponse {
  authenticated: boolean;
  userId?: string;
}

export interface GateValidateRequest {
  code: string;
  userId?: string;
}

export interface GateValidateResponse {
  valid: boolean;
  userId: string;
}
