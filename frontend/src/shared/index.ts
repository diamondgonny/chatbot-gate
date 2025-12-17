/**
 * Shared Module
 *
 * Feature 전반에서 사용되는 공통 utility, component, hook, type
 * Feature 간 공유 코드는 @/shared에서 import
 */

// API
export {
  apiClient,
  handleAuthError,
  checkAuthStatus,
  validateGateCode,
  navigation,
} from "./api";

// Components
export { AlertModal, ToastContainer } from "./components";

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
