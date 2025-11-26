// Authentication utility functions for managing JWT and sessionId

/**
 * Save authentication data to localStorage
 */
export const saveAuth = (sessionId: string, jwt: string): void => {
  localStorage.setItem('sessionId', sessionId);
  localStorage.setItem('jwt', jwt);
};

/**
 * Get authentication data from localStorage
 */
export const getAuth = (): { sessionId: string | null; jwt: string | null } => {
  return {
    sessionId: localStorage.getItem('sessionId'),
    jwt: localStorage.getItem('jwt'),
  };
};

/**
 * Clear authentication data (logout)
 */
export const clearAuth = (): void => {
  localStorage.removeItem('sessionId');
  localStorage.removeItem('jwt');
};

/**
 * Get Authorization headers for API calls
 */
export const getAuthHeaders = (): Record<string, string> => {
  const { jwt } = getAuth();
  
  if (!jwt) {
    return {};
  }

  return {
    Authorization: `Bearer ${jwt}`,
  };
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  const { sessionId, jwt } = getAuth();
  return !!(sessionId && jwt);
};
