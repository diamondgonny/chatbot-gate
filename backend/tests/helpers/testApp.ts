/**
 * Test Express App
 * Minimal app setup for integration testing using shared factory.
 */

import { createTestApp } from '../../src/shared';

export const app = createTestApp();
export default app;
