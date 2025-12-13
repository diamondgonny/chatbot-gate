/**
 * Shared Module
 *
 * Common utilities, components, hooks, and types used across features.
 * Import from @/shared for cross-feature shared code.
 */

// APIs
export {
  apiClient,
  handleAuthError,
  checkAuthStatus,
  validateGateCode,
  navigation,
} from "./apis";

// Components
export { AlertModal } from "./components";

// Types
export type {
  AuthStatusResponse,
  GateValidateRequest,
  GateValidateResponse,
} from "./types";

// Utils
export {
  saveUserId,
  getUserId,
  clearAuth,
  isAuthenticated,
} from "./utils";
