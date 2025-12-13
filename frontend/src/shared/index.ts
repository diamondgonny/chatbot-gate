/**
 * Shared Module
 *
 * Common utilities, components, hooks, and types used across features.
 * Import from @/shared for cross-feature shared code.
 */

// APIs
export { apiClient, checkAuthStatus, validateGateCode, navigation } from "./apis";

// Components
export { AlertModal } from "./components";

// Hooks
export { useTitleAlert } from "./hooks";

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
  formatTimeAgo,
} from "./utils";
