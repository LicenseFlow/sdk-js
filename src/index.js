"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseFlowClient = void 0;
const axios_1 = __importStar(require("axios"));
const jose = __importStar(require("jose"));
class LicenseFlowClient {
    api;
    config;
    constructor(config) {
        this.config = config;
        this.api = axios_1.default.create({
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
    async activate(payload) {
        try {
            const response = await this.api.post('/functions/v1/activate-license', payload);
            return response.data;
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    /**
     * Verify the current status of a license
     */
    async verify(payload) {
        try {
            const response = await this.api.post('/functions/v1/verify-license', payload);
            return response.data;
        }
        catch (error) {
            const errRes = this.handleError(error);
            return { valid: false, error: errRes.message };
        }
    }
    /**
     * Record usage metrics for a license
     */
    async recordUsage(payload) {
        try {
            const response = await this.api.post('/functions/v1/record-usage', payload);
            return { success: true, ...response.data };
        }
        catch (error) {
            const errRes = this.handleError(error);
            return { success: false, error: errRes.message };
        }
    }
    /**
     * Validate a signed proof offline
     * @param proof The signed JWT from the server
     * @param publicKey The secret key used for signing (HS256)
     */
    async validateProofOffline(proof, secret) {
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
        }
        catch (error) {
            return {
                valid: false,
                error: error.message,
            };
        }
    }
    handleError(error) {
        if (error.response?.data) {
            return error.response.data;
        }
        return { success: false, message: error.message || 'Network error' };
    }
}
exports.LicenseFlowClient = LicenseFlowClient;
//# sourceMappingURL=index.js.map