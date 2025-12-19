export interface LicenseFlowConfig {
    baseUrl: string;
    apiKey: string;
    jwtSecret?: string;
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
    proof?: string;
}
export interface VerificationResponse {
    valid: boolean;
    status?: string;
    proof?: string;
    error?: string;
}
export declare class LicenseFlowClient {
    private api;
    private config;
    constructor(config: LicenseFlowConfig);
    /**
     * Activate a license for a specific device
     */
    activate(payload: ActivationPayload): Promise<ActivationResponse>;
    /**
     * Verify the current status of a license
     */
    verify(payload: VerificationPayload): Promise<VerificationResponse>;
    /**
     * Record usage metrics for a license
     */
    recordUsage(payload: UsagePayload): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Validate a signed proof offline
     * @param proof The signed JWT from the server
     * @param publicKey The secret key used for signing (HS256)
     */
    validateProofOffline(proof: string, secret?: string): Promise<any>;
    private handleError;
}
//# sourceMappingURL=index.d.ts.map