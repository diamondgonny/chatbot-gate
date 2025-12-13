/**
 * @deprecated
 * - For apiClient, checkAuthStatus, validateGateCode: import from @/shared
 * - For chat/session APIs: import from @/features/chat
 */

// Shared APIs - re-export from shared
export { apiClient as default } from "@/shared";
export { checkAuthStatus, validateGateCode } from "@/shared";
export { navigation } from "@/shared";
