import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LicenseFlowClient } from '../src/index.ts';

const server = setupServer(
    http.post('https://api.test/functions/v1/activate-license', () => {
        return HttpResponse.json({ success: true, message: 'Activated', proof: 'dummy-jwt' });
    }),
    http.post('https://api.test/functions/v1/verify-license', () => {
        return HttpResponse.json({ valid: true, status: 'active' });
    })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('LicenseFlowClient', () => {
    const client = new LicenseFlowClient({
        baseUrl: 'https://api.test',
        apiKey: 'test-key',
        jwtSecret: 'test-secret'
    });

    it('should activate a license', async () => {
        const res = await client.activate({
            license_key: 'TEST-KEY',
            device_id: 'device-1'
        });
        expect(res.success).toBe(true);
        expect(res.proof).toBe('dummy-jwt');
    });

    it('should verify a license', async () => {
        const res = await client.verify({
            license_key: 'TEST-KEY',
            device_id: 'device-1'
        });
        expect(res.valid).toBe(true);
        // Note: status is returned in the mock
    });
});
