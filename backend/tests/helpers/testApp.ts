/**
 * Test Express App
 * Minimal app setup for integration testing using shared factory.
 */

import { createTestApp } from '../../src/app';

export const app = createTestApp();
export default app;
