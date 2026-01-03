import axios, { type AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import * as jose from 'jose';
import { machineIdSync } from 'node-machine-id';
import NodeCache from 'node-cache';
import os from 'os';
import { webcrypto } from 'node:crypto'; // For offline verification


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
    currentActivations?: number;
    expiresAt?: string;
    entitlements?: Record<string, any>; // Feature flags
    proof?: string; // Signed JWT
    error?: string;
}

export interface VerificationResponse {
    valid: boolean;
    status?: string;
    proof?: string; // Signed JWT
    error?: string;
    entitlements?: Record<string, any>;
}

export interface UpdateInfo {
    id: string;
    version: string;
    changelog?: string;
    published_at: string;
}

export interface ArtifactDownload {
    url: string;
    filename: string;
    file_size: number;
    checksum_sha256: string;
    checksum_md5?: string;
    platform: string;
    architecture: string;
    version: string;
    expires_in: number;
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

    async deactivate(payload: { license_key: string; device_id?: string }): Promise<{ success: boolean }> {
        const deviceId = payload.device_id || this.getHardwareId();

        try {
            const response = await this.api.post('/functions/v1/deactivate-license', {
                license_key: payload.license_key,
                device_id: deviceId,
            });

            this.clearCache(); // Clear cache to reflect changes
            return response.data;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * Clears the internal verification cache.
     */
    clearCache(): void {
        this.cache.flushAll();
    }

    /**
     * Phase 5: Entitlements - Check if license has a feature enabled
     */
    hasFeature(verification: VerificationResponse, featureCode: string): boolean {
        if (!verification.valid || !verification.entitlements) {
            return false;
        }

        const ent = verification.entitlements[featureCode];
        if (!ent) return false;

        if (typeof ent === 'boolean') return ent;
        if (typeof ent === 'object') {
            return ent.enabled === true || ent.value === true;
        }
        return ent === true;
    }

    /**
     * Phase 5: Entitlements - Get entitlement value
     */
    getEntitlement(verification: VerificationResponse, featureCode: string): any {
        if (!verification.valid || !verification.entitlements) {
            return null;
        }
        return verification.entitlements[featureCode] || null;
    }

    /**
     * Phase 5: Release Management - Check for software updates
     */
    async checkForUpdates(opts: {
        currentVersion: string;
        product_id: string;
        channel?: string;
    }): Promise<UpdateInfo | null> {
        try {
            const response = await this.api.get('/functions/v1/release-management/latest', {
                params: {
                    product_id: opts.product_id,
                    channel: opts.channel || 'stable',
                },
            });

            const data = response.data;

            if (!data || data.version === opts.currentVersion) {
                return null;
            }

            return {
                id: data.id,
                version: data.version,
                changelog: data.changelog,
                published_at: data.published_at,
            };
        } catch (error: any) {
            if (error.response?.status === 404) return null; // No release found
            throw this.handleError(error);
        }
    }

    /**
     * Phase 5: Release Management - Download artifact with license verification
     */
    async downloadArtifact(opts: {
        licenseKey: string;
        release_id?: string;
        artifact_id?: string;
        platform?: string;
        architecture?: string;
    }): Promise<ArtifactDownload> {
        try {
            const response = await this.api.post('/functions/v1/artifact-download', opts);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Phase 5: Offline Licensing - Verify offline license file
     */
    async verifyOfflineLicense(licenseFile: string, publicKey: string): Promise<any> {
        try {
            const data = JSON.parse(licenseFile);

            if (!data.license || !data.signature) {
                throw new Error('Invalid offline license format');
            }

            const message = JSON.stringify(data.license);
            const encoder = new TextEncoder();
            const messageBuffer = encoder.encode(message);
            const signatureBuffer = Buffer.from(data['signature'], 'base64');
            const publicKeyBuffer = Buffer.from(publicKey, 'hex');

            const cryptoKey = await webcrypto.subtle.importKey(
                'raw',
                publicKeyBuffer,
                { name: 'Ed25519', namedCurve: 'Ed25519' },
                false,
                ['verify']
            );

            const isValid = await webcrypto.subtle.verify(
                'Ed25519',
                cryptoKey,
                signatureBuffer,
                messageBuffer
            );

            if (!isValid) {
                throw new Error('Invalid offline license signature');
            }

            const validUntil = new Date(data.license.valid_until);
            if (validUntil < new Date()) {
                throw new Error('Offline license has expired');
            }

            return data.license;
        } catch (error: any) {
            throw this.handleError(error);
        }
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
