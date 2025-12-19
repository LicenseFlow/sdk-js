import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LicenseFlowClient, RateLimitError, InvalidLicenseError } from '../src/index.ts';

const server = setupServer(
    http.post('https://api.test/functions/v1/activate-license', () => {
        return HttpResponse.json({ success: true, message: 'Activated', proof: 'dummy-jwt' });
    }),
    http.post('https://api.test/functions/v1/verify-license', () => {
        return HttpResponse.json({ valid: true, status: 'active' });
    })
);

beforeAll(() => server.listen());
afterEach(() => {
    server.resetHandlers();
});
afterAll(() => server.close());

describe('LicenseFlowClient', () => {
    const client = new LicenseFlowClient({
        baseUrl: 'https://api.test',
        apiKey: 'test-key',
        jwtSecret: 'test-secret',
        retries: 0
    });

    afterEach(() => {
        client.clearCache();
    });

    it('should activate a license and auto-generate fingerprint', async () => {
        const res = await client.activate({
            license_key: 'TEST-KEY'
            // device_id omitted to test auto-generation
        });
        expect(res.success).toBe(true);
        expect(res.proof).toBe('dummy-jwt');
    });

    it('should verify a license and use cache', async () => {
        const res1 = await client.verify({
            license_key: 'TEST-KEY'
        });
        expect(res1.valid).toBe(true);

        // Second call should come from cache (server would be called once)
        const res2 = await client.verify({
            license_key: 'TEST-KEY'
        });
        expect(res2.valid).toBe(true);
        expect(res2.cached).toBe(true);
    });

    it('should deactivate a license', async () => {
        server.use(
            http.post('https://api.test/functions/v1/deactivate-license', () => {
                return HttpResponse.json({ success: true, message: 'Deactivated' });
            })
        );

        const res = await client.deactivate({ license_key: 'TEST-KEY' });
        expect(res.success).toBe(true);
    });

    it('should throw RateLimitError on 429', async () => {
        server.use(
            http.post('https://api.test/functions/v1/verify-license', () => {
                return new HttpResponse(JSON.stringify({ message: 'Too many requests' }), { status: 429 });
            })
        );

        await expect(client.verify({ license_key: 'TEST-KEY' }))
            .rejects.toThrow(RateLimitError);
    });

    it('should throw InvalidLicenseError on 400', async () => {
        server.use(
            http.post('https://api.test/functions/v1/verify-license', () => {
                return new HttpResponse(JSON.stringify({ message: 'Invalid license' }), { status: 400 });
            })
        );

        await expect(client.verify({ license_key: 'TEST-KEY' }))
            .rejects.toThrow(InvalidLicenseError);
    });
});
