import axios, { type AxiosInstance } from 'axios';
import * as jose from 'jose';

export interface LicenseFlowConfig {
    baseUrl: string;
    apiKey: string;
    jwtSecret?: string; // Optional for offline validation
}

export interface ActivationPayload {
    license_key: string;
    device_id: string;
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

    constructor(config: LicenseFlowConfig) {
        this.config = config;
        this.api = axios.create({
            baseURL: config.baseUrl,
            headers: {
                'x-api-key': config.apiKey,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Activate a license for a specific device
     */
    async activate(payload: ActivationPayload): Promise<ActivationResponse> {
        try {
            const response = await this.api.post('/functions/v1/activate-license', payload);
            return response.data;
        } catch (error: any) {
            return this.handleError(error);
        }
    }

    /**
     * Verify the current status of a license
     */
    async verify(payload: VerificationPayload): Promise<VerificationResponse> {
        try {
            const response = await this.api.post('/functions/v1/verify-license', payload);
            return response.data;
        } catch (error: any) {
            const errRes = this.handleError(error);
            return { valid: false, error: errRes.message };
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
            const errRes = this.handleError(error);
            return { success: false, error: errRes.message };
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

    private handleError(error: any) {
        if (error.response?.data) {
            return error.response.data;
        }
        return { success: false, message: error.message || 'Network error' };
    }
}
