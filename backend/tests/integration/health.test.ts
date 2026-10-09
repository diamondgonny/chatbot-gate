/**
 * Health API Integration Tests
 * Tests for GET /health endpoint
 */

import request from 'supertest';
import app from '../helpers/testApp';

describe('Health API - GET /health', () => {
  const original = {
    DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
    BUILD_SHA: process.env.BUILD_SHA,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should keep the existing status and message', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      message: 'Chatbot Gate Backend is running',
    });
  });

  it('should report the deployment env and build of the container', async () => {
    process.env.DEPLOYMENT_ENV = 'green';
    process.env.BUILD_SHA = '6598cea0000000000000000000000000000000aa';

    const response = await request(app).get('/health');

    expect(response.body.env).toBe('green');
    expect(response.body.build).toBe('6598cea0000000000000000000000000000000aa');
  });

  it('should report unknown when the identifiers are not set', async () => {
    delete process.env.DEPLOYMENT_ENV;
    delete process.env.BUILD_SHA;

    const response = await request(app).get('/health');

    expect(response.body.env).toBe('unknown');
    expect(response.body.build).toBe('unknown');
  });

  it('should report unknown when the identifiers are empty', async () => {
    process.env.DEPLOYMENT_ENV = '';
    process.env.BUILD_SHA = '';

    const response = await request(app).get('/health');

    expect(response.body.env).toBe('unknown');
    expect(response.body.build).toBe('unknown');
  });
});
