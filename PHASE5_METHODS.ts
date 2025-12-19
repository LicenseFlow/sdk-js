// Phase 5 Enterprise Features - SDK Methods
// Add these methods to the LicenseFlowClient class in src/index.ts

/**
 * Phase 5: Entitlements - Check if license has a feature enabled
 * @param verification - Response from verify() method
 * @param featureCode - Feature code to check (e.g., 'ai_features')
 * @returns True if feature is enabled
 */
hasFeature(verification: VerificationResponse, featureCode: string): boolean {
    if (!verification.valid || !verification.entitlements) {
        return false;
    }

    const ent = verification.entitlements[featureCode];
    if (!ent) return false;

    // Handle different value formats
    if (typeof ent === 'boolean') return ent;
    if (typeof ent === 'object') {
        return ent.enabled === true || ent.value === true;
    }
    return ent === true;
}

/**
 * Phase 5: Entitlements - Get entitlement value
 * @param verification - Response from verify() method
 * @param featureCode - Feature code to retrieve
 * @returns Entitlement value or null
 */
getEntitlement(verification: VerificationResponse, featureCode: string): any {
    if (!verification.valid || !verification.entitlements) {
        return null;
    }
    return verification.entitlements[featureCode] || null;
}

/**
 * Phase 5: Release Management - Check for software updates
 * @param opts - Update check options
 * @returns Update info if newer version available, null otherwise
 */
async checkForUpdates(opts: {
    currentVersion: string;
    product_id: string;
    channel?: string;
}): Promise < UpdateInfo | null > {
    try {
        const response = await this.api.get('/functions/v1/release-management/latest', {
            params: {
                product_id: opts.product_id,
                channel: opts.channel || 'stable',
            },
        });

        const data = response.data;

        // If no update or same version, return null
        if(!data || data.version === opts.currentVersion) {
    return null;
}

return {
    id: data.id,
    version: data.version,
    changelog: data.changelog,
    published_at: data.published_at,
};
    } catch (error: any) {
    throw this.handleError(error);
}
}

/**
 * Phase 5: Release Management - Download artifact with license verification
 * @param opts - Download options
 * @returns Download URL and metadata
 */
async downloadArtifact(opts: {
    licenseKey: string;
    release_id?: string;
    artifact_id?: string;
    platform?: string;
    architecture?: string;
}): Promise < ArtifactDownload > {
    try {
        const response = await this.api.post('/functions/v1/artifact-download', opts);
        return response.data;
    } catch(error: any) {
        throw this.handleError(error);
    }
}

/**
 * Phase 5: Offline Licensing - Verify offline license file
 * @param licenseFile - JSON string of .lic file contents
 * @param publicKey - Organization's Ed25519 public key (hex)
 * @returns Verified license data
 */
async verifyOfflineLicense(licenseFile: string, publicKey: string): Promise < any > {
    try {
        const data = JSON.parse(licenseFile);

        if(!data.license || !data.signature) {
    throw new Error('Invalid offline license format');
}

const message = JSON.stringify(data.license);
const encoder = new TextEncoder();
const messageBuffer = encoder.encode(message);
const signatureBuffer = Buffer.from(data['signature'], 'base64');
const publicKeyBuffer = Buffer.from(publicKey, 'hex');

// Import public key for verification
const cryptoKey = await crypto.subtle.importKey(
    'raw',
    publicKeyBuffer,
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    false,
    ['verify']
);

// Verify Ed25519 signature
const isValid = await crypto.subtle.verify(
    'Ed25519',
    cryptoKey,
    signatureBuffer,
    messageBuffer
);

if (!isValid) {
    throw new LicenseVerificationError('Invalid offline license signature');
}

// Check expiration
const validUntil = new Date(data.license.valid_until);
if (validUntil < new Date()) {
    throw new LicenseExpiredError('Offline license has expired');
}

return data.license;
    } catch (error: any) {
    if (error instanceof LicenseFlowError) {
        throw error;
    }
    throw new LicenseVerificationError(`Failed to verify offline license: ${error.message}`);
}
}

// Add these interfaces to the top of the file (after existing interfaces):

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

// Update VerificationResponse interface to include:
// entitlements?: Record<string, any>;
