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
    apiKey?: string;
    clientToken?: string;
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
    environment_id?: string;
}

export interface VerificationPayload {
    license_key: string;
    device_id?: string;
    environment_id?: string;
}

export interface UsagePayload {
    license_key: string;
    metric_name: string;
    value: number;
    increment?: boolean;
    is_test?: boolean;
    environment_id?: string;
}

export interface UsageTrackOptions {
    licenseKey?: string;
    customerId?: string;
    featureName: string;
    quantity?: number;
    idempotencyKey?: string;
    dimensions?: Record<string, any>;
    metadata?: Record<string, any>;
    unit?: string;
    isTest?: boolean;
}

export interface UsageTrackResponse {
    success: boolean;
    status: 'normal' | 'warning' | 'critical' | 'exceeded';
    action: 'ALLOW' | 'WARN' | 'BLOCK';
    currentUsage?: number;
    quotaLimit?: number | null;
    overageUnits?: number;
    enforcementPolicy?: string;
    eventId?: string;
    isDuplicate?: boolean;
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

export interface LeaseResponse {
    lease_key: string;
    license_id: string;
    expires_at: string;
    duration_seconds: number;
    status: string;
}

export interface CheckoutPayload {
    license_key: string;
    duration_seconds?: number;
    requester_id?: string;
    requester_type?: string;
    metadata?: Record<string, any>;
}

export interface IdentityResolutionPayload {
    /** Verified email address of the authenticated end user. */
    email: string;
    /** Optional: scope the resolution to a single product. */
    product_id?: string;
    /** Optional: environment to resolve against. */
    environment_id?: string;
}

export interface IdentityEntitlementGrant {
    license_id: string;
    license_key?: string;
    product_id: string;
    product_name?: string;
    source: 'owner' | 'seat';
    status: string;
    expires_at?: string | null;
    entitlements: Record<string, any>;
}

export interface IdentityResolutionResponse {
    resolved: boolean;
    email: string;
    grants: IdentityEntitlementGrant[];
    entitlements: Record<string, any>;
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

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (config.apiKey) {
            headers['x-api-key'] = config.apiKey;
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
        if (config.clientToken) {
            headers['x-client-token'] = config.clientToken;
            if (!config.apiKey) {
                headers['Authorization'] = `Bearer ${config.clientToken}`;
            }
        }

        this.api = axios.create({
            baseURL: config.baseUrl,
            headers,
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

        const cacheKey = `verify:${payload.license_key}:${payload.device_id}:${payload.environment_id || 'default'}`;
        const cached = this.cache.get<VerificationResponse>(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            // Map environment_id to environmentId for the backend if needed (backend expects environmentId in verify)
            const backendPayload = {
                licenseKey: payload.license_key,
                deviceId: payload.device_id,
                environmentId: payload.environment_id
            };
            const response = await this.api.post('/functions/v1/verify-license', backendPayload);
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
     * Record usage metrics for a license (legacy signature)
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
     * High-throughput usage & telemetry tracking with idempotency, dimensions, and quota enforcement.
     */
    async trackUsage(options: UsageTrackOptions): Promise<UsageTrackResponse> {
        try {
            const payload = {
                license_key: options.licenseKey,
                customer_id: options.customerId,
                event_name: options.featureName,
                quantity: options.quantity ?? 1,
                idempotency_key: options.idempotencyKey,
                dimensions: options.dimensions || {},
                metadata: options.metadata || {},
                unit: options.unit || 'units',
                is_test: options.isTest,
            };
            const response = await this.api.post('/functions/v1/record-usage', payload);
            const data = response.data;
            return {
                success: data.success ?? true,
                status: data.status || 'normal',
                action: data.action || 'ALLOW',
                currentUsage: data.current_usage ?? data.currentUsage,
                quotaLimit: data.quota_limit ?? data.quotaLimit,
                overageUnits: data.overage_units ?? data.overageUnits ?? 0,
                enforcementPolicy: data.enforcement_policy,
                eventId: data.event_id,
                isDuplicate: data.is_duplicate,
            };
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Fluent usage namespace helper
     */
    public get usage() {
        return {
            track: (opts: UsageTrackOptions) => this.trackUsage(opts),
        };
    }

    /**
     * Identity-based (keyless) entitlement resolution.
     *
     * Resolve everything an authenticated person is entitled to from their email
     * alone — licenses they own plus any seats assigned to them — without handling
     * a license key. Authenticate the user in your own app (or IDP) first, then
     * call this from your backend with the verified email.
     */
    async resolveForIdentity(payload: IdentityResolutionPayload): Promise<IdentityResolutionResponse> {
        const cacheKey = `identity:${payload.email}:${payload.product_id || 'all'}:${payload.environment_id || 'default'}`;

        // Seats can be reclaimed at any time, so the server is always asked first.
        // A cached result is only used when the server can't be reached, and only
        // for a short window — never as a substitute for a real revocation answer.
        try {
            const response = await this.api.post('/functions/v1/resolve-entitlements', {
                email: payload.email,
                productId: payload.product_id,
                environmentId: payload.environment_id,
            });
            const data = response.data as IdentityResolutionResponse;

            if (data.resolved) {
                this.cache.set(cacheKey, data);
            } else {
                this.cache.invalidate(cacheKey);
            }

            return data;
        } catch (error: any) {
            const status = error?.response?.status;
            const isNetworkFailure = !status || status >= 500;
            const cached = this.cache.get<IdentityResolutionResponse>(cacheKey);
            const IDENTITY_FALLBACK_MS = 5 * 60 * 1000;
            if (isNetworkFailure && cached && Date.now() - cached.cachedAt < IDENTITY_FALLBACK_MS) {
                return cached.data;
            }
            if (!isNetworkFailure) this.cache.invalidate(cacheKey);
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

    async deactivate(payload: { license_key: string; device_id?: string; environment_id?: string }): Promise<{ success: boolean }> {
        const deviceId = payload.device_id || this.getHardwareId();

        try {
            const response = await this.api.post('/functions/v1/deactivate-license', {
                license_key: payload.license_key,
                device_id: deviceId,
                environment_id: payload.environment_id
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

    // ── Floating License Lease Methods ──

    /**
     * Acquire a temporary floating license lease
     */
    async checkoutLicense(payload: CheckoutPayload): Promise<LeaseResponse> {
        try {
            const body = {
                license_key: payload.license_key,
                duration_seconds: payload.duration_seconds ?? 3600,
                requester_id: payload.requester_id ?? this.getHardwareId(),
                requester_type: payload.requester_type ?? 'sdk',
                metadata: payload.metadata,
            };
            const response = await this.api.post('/functions/v1/checkout-license', body);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Release (check-in) a floating license lease
     */
    async checkinLicense(leaseKey: string): Promise<{ success: boolean }> {
        try {
            const response = await this.api.post('/functions/v1/checkin-license', { lease_key: leaseKey });
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Get the status of a floating license lease
     */
    async getLeaseStatus(leaseKey: string): Promise<LeaseResponse> {
        try {
            const response = await this.api.post('/functions/v1/lease-status', { lease_key: leaseKey });
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    // ── Credits / Usage-Based Billing & Token Metering ──

    /**
     * Meter usage (record consumption or decrement units for token-metered licenses)
     */
    async meterUsage(payload: {
        metric_name: string;
        value?: number;
        license_key?: string;
        client_token?: string;
        metadata?: Record<string, any>;
    }): Promise<{
        accepted: boolean;
        current_usage?: number;
        usage_limit?: number;
        remaining_tokens?: number;
        event_count?: number;
        processing?: string;
        error?: string;
    }> {
        try {
            const headers: Record<string, string> = {};
            if (payload.client_token) {
                headers['x-client-token'] = payload.client_token;
                headers['Authorization'] = `Bearer ${payload.client_token}`;
            }
            const response = await this.api.post('/functions/v1/record-usage', {
                metric_name: payload.metric_name,
                metric_value: payload.value ?? 1,
                license_key: payload.license_key,
                metadata: payload.metadata,
            }, { headers });
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Consume credits from the organization's balance
     */
    async consumeCredits(payload: {
        amount: number;
        description?: string;
        product_id?: string;
        currency?: string;
        reference_id?: string;
        reference_type?: string;
        metadata?: Record<string, any>;
    }): Promise<{ success: boolean; remaining?: number; consumed?: number; error?: string }> {
        try {
            const response = await this.api.post('/functions/v1/consume-credits', payload);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Get credit balance for the organization
     */
    async getCreditsBalance(productId?: string, currency?: string): Promise<any> {
        try {
            const params: Record<string, string> = {};
            if (productId) params.product_id = productId;
            if (currency) params.currency = currency;
            const response = await this.api.get('/functions/v1/get-credit-balance', { params });
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    // ── Entitlements Management ──

    /**
     * List all entitlements for the organization
     */
    async listEntitlements(): Promise<any[]> {
        try {
            const response = await this.api.get('/functions/v1/manage-entitlements');
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Create a new entitlement definition
     */
    async createEntitlement(payload: {
        code: string;
        name: string;
        description?: string;
        data_type?: 'boolean' | 'number' | 'string' | 'json';
        metadata?: Record<string, any>;
    }): Promise<any> {
        try {
            const response = await this.api.post('/functions/v1/manage-entitlements', payload);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Update an existing entitlement definition
     */
    async updateEntitlement(entitlementId: string, payload: {
        code?: string;
        name?: string;
        description?: string;
        data_type?: 'boolean' | 'number' | 'string' | 'json';
        metadata?: Record<string, any>;
    }): Promise<any> {
        try {
            const response = await this.api.patch(`/functions/v1/manage-entitlements/${entitlementId}`, payload);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Delete an entitlement definition
     */
    async deleteEntitlement(entitlementId: string): Promise<{ success: boolean }> {
        try {
            const response = await this.api.delete(`/functions/v1/manage-entitlements/${entitlementId}`);
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Assign an entitlement to a specific license
     */
    async assignEntitlementToLicense(entitlementId: string, licenseId: string, value: Record<string, any>): Promise<any> {
        try {
            const response = await this.api.post(`/functions/v1/manage-entitlements/${entitlementId}/assign-to-license`, {
                license_id: licenseId,
                value,
            });
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    /**
     * Assign an entitlement to a policy (as default)
     */
    async assignEntitlementToPolicy(entitlementId: string, policyId: string, defaultValue: Record<string, any>): Promise<any> {
        try {
            const response = await this.api.post(`/functions/v1/manage-entitlements/${entitlementId}/assign-to-policy`, {
                policy_id: policyId,
                default_value: defaultValue,
            });
            return response.data;
        } catch (error: any) {
            throw this.handleError(error);
        }
    }

    // ── Heartbeat ──

    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    /**
     * Start periodic heartbeat to keep a license session alive
     */
    startHeartbeat(licenseKey: string, intervalMs: number = 60000): void {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(async () => {
            try {
                await this.verify({ license_key: licenseKey });
            } catch (err) {
                console.warn('LicenseFlow heartbeat failed:', err);
            }
        }, intervalMs);
    }

    /**
     * Stop the periodic heartbeat
     */
    stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * AI Control Plane & Ingress Gateway
     */
    public readonly gateway = {
        createCompletion: async (payload: {
            model: string;
            messages: Array<{ role: string; content: string }>;
            agentId?: string;
            geoPolicy?: string;
            fallbackModel?: string;
            temperature?: number;
            max_tokens?: number;
            stream?: boolean;
            metadata?: Record<string, unknown>;
        }) => {
            try {
                const headers: Record<string, string> = {};
                if (payload.agentId) headers['x-lf-agent-id'] = payload.agentId;
                if (payload.geoPolicy) headers['x-lf-geo-policy'] = payload.geoPolicy;
                if (payload.fallbackModel) headers['x-lf-fallback-model'] = payload.fallbackModel;

                const response = await this.api.post('/functions/v1/ai-gateway', payload, { headers });
                return response.data;
            } catch (error) {
                throw this.handleError(error);
            }
        },
    };

    /**
     * Zero-Trust Credential Vault
     */
    public readonly vault = {
        storeSecret: async (params: {
            provider: string;
            keyLabel: string;
            secretKey: string;
            allowedModels?: string[];
            allowedAgentIds?: string[];
        }) => {
            try {
                const response = await this.api.post('/functions/v1/vault-keys', params);
                return response.data;
            } catch (error) {
                throw this.handleError(error);
            }
        },
    };

    /**
     * Autonomous Emergency Kill Switches & TTL
     */
    public readonly killSwitch = {
        trigger: async (params: {
            targetId: string;
            level: 'soft' | 'hard' | 'cascading' | 'panic';
            reason: string;
            ttlSeconds?: number;
        }) => {
            try {
                const response = await this.api.post('/functions/v1/kill-switch', params);
                return response.data;
            } catch (error) {
                throw this.handleError(error);
            }
        },
        panic: async (reason = 'Global Emergency Swarm Quarantine') => {
            try {
                const response = await this.api.post('/functions/v1/kill-switch', {
                    targetId: '*',
                    level: 'panic',
                    reason,
                });
                return response.data;
            } catch (error) {
                throw this.handleError(error);
            }
        },
    };

    /**
     * Sovereign Regional Geo-Policies (GDPR / Data Residency)
     */
    public readonly geoPolicies = {
        create: async (params: {
            policyName: string;
            allowedRegions: string[];
            enforcementMode?: 'warn' | 'block';
            targetAgentPatterns?: string[];
        }) => {
            try {
                const response = await this.api.post('/functions/v1/geo-policies', params);
                return response.data;
            } catch (error) {
                throw this.handleError(error);
            }
        },
    };

    /**
     * Continuous SOC 2 Type II Evidence Engine
     */
    public readonly compliance = {
        getSoc2Evidence: async (params?: { timeframe?: string; format?: string }) => {
            try {
                const response = await this.api.get('/functions/v1/soc2-evidence-collector', { params });
                return response.data;
            } catch (error) {
                throw this.handleError(error);
            }
        },
    };

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
