/**
 * Auth types (shared concern)
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
