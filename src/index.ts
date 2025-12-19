import axios, { type AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import * as jose from 'jose';
import { machineIdSync } from 'node-machine-id';
import NodeCache from 'node-cache';
import os from 'os';

/**
 * Custom Error Classes
 */
export class LicenseFlowError extends Error {
    constructor(message: string, public code?: string, public status?: number) {
        super(message);
        this.name = 'LicenseFlowError';
    }
}

export class NetworkError extends LicenseFlowError {
    constructor(message: string) {
        super(message, 'NETWORK_ERROR');
        this.name = 'NetworkError';
    }
}

export class RateLimitError extends LicenseFlowError {
    constructor(message: string) {
        super(message, 'RATE_LIMIT_EXCEEDED', 429);
        this.name = 'RateLimitError';
    }
}

export class InvalidLicenseError extends LicenseFlowError {
    constructor(message: string) {
        super(message, 'INVALID_LICENSE', 400);
        this.name = 'InvalidLicenseError';
    }
}

export interface LicenseFlowConfig {
    baseUrl: string;
    apiKey: string;
    jwtSecret?: string;
    cacheTTL?: number; // Caching TTL in seconds (default 300)
    retries?: number;  // Number of retries for network errors (default 3)
}

export interface ActivationPayload {
    license_key: string;
    device_id?: string;
    device_name?: string;
    hardware_fingerprint?: any;
    is_test?: boolean;
}

export interface VerificationPayload {
    license_key: string;
    device_id?: string;
}

export interface UsagePayload {
    license_key: string;
    metric_name: string;
    value: number;
    increment?: boolean;
    is_test?: boolean;
}

export interface ActivationResponse {
    success: boolean;
    message: string;
    activation?: any;
    license?: any;
    proof?: string; // Signed JWT
}

export interface VerificationResponse {
    valid: boolean;
    status?: string;
    proof?: string; // Signed JWT
    error?: string;
}

export class LicenseFlowClient {
    private api: AxiosInstance;
    private config: LicenseFlowConfig;
    private cache: NodeCache;

    constructor(config: LicenseFlowConfig) {
        this.config = {
            cacheTTL: 300,
            retries: 3,
            ...config
        };

        this.cache = new NodeCache({ stdTTL: this.config.cacheTTL });

        this.api = axios.create({
            baseURL: config.baseUrl,
            headers: {
                'x-api-key': config.apiKey,
                'Content-Type': 'application/json',
            },
        });

        // Configure Retries
        axiosRetry(this.api, {
            retries: this.config.retries,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error: AxiosError) => {
                return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
            },
        });
    }

    /**
     * Get unique hardware fingerprint for the current device
     */
    getHardwareId(): string {
        try {
            return machineIdSync();
        } catch (error) {
            console.warn('Failed to get hardware ID, falling back to hostname');
            return os.hostname();
        }
    }

    /**
     * Activate a license for a specific device
     */
    async activate(payload: ActivationPayload): Promise<ActivationResponse> {
        try {
            // Automatically include hardware ID if not provided
            if (!payload.device_id) {
                payload.device_id = this.getHardwareId();
            }

            const response = await this.api.post('/functions/v1/activate-license', payload);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Verify the current status of a license
     */
    async verify(payload: VerificationPayload): Promise<VerificationResponse> {
        // Automatically include hardware ID if not provided
        if (!payload.device_id) {
            payload.device_id = this.getHardwareId();
        }

        const cacheKey = `verify:${payload.license_key}:${payload.device_id}`;
        const cached = this.cache.get<VerificationResponse>(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            const response = await this.api.post('/functions/v1/verify-license', payload);
            const data = response.data;

            if (data.valid) {
                this.cache.set(cacheKey, data);
            }

            return data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Record usage metrics for a license
     */
    async recordUsage(payload: UsagePayload): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await this.api.post('/functions/v1/record-usage', payload);
            return { success: true, ...response.data };
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Validate a signed proof offline
     * @param proof The signed JWT from the server
     * @param publicKey The secret key used for signing (HS256)
     */
    async validateProofOffline(proof: string, secret?: string): Promise<any> {
        const key = secret || this.config.jwtSecret;
        if (!key) {
            throw new Error('JWT Secret is required for offline validation');
        }

        try {
            const secretKey = new TextEncoder().encode(key);
            const { payload } = await jose.jwtVerify(proof, secretKey);
            return {
                valid: true,
                payload,
            };
        } catch (error: any) {
            return {
                valid: false,
                error: error.message,
            };
        }
    }

    /**
     * Clear the internal cache
     */
    clearCache(): void {
        this.cache.flushAll();
    }

    private handleError(error: any): LicenseFlowError {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const data = error.response?.data;
            const message = data?.message || data?.error || error.message;

            if (status === 429) {
                return new RateLimitError(message);
            }
            if (status === 400 || status === 404) {
                return new InvalidLicenseError(message);
            }
            if (!status || status >= 500) {
                return new NetworkError(message);
            }
            return new LicenseFlowError(message, 'API_ERROR', status);
        }

        return new LicenseFlowError(error.message || 'Unknown error');
    }
}
