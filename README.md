# LicenseFlow Node.js SDK

**Stop Building Licensing Infrastructure. Start Shipping Software.**

The official Node.js/TypeScript SDK for LicenseFlow. Protect your intellectual property, enforce entitlements, and manage software distribution with one-line integration.

## Installation

```bash
npm install licenseflow
```

## Features

- ✅ **License Activation & Verification** - Activate and verify license keys
- ✅ **Hardware Binding** - Lock licenses to specific devices
- ✅ **Entitlements** (Phase 5) - Feature flags and tier-based access control
- ✅ **Release Management** (Phase 5) - Check for updates and download artifacts
- ✅ **Offline Licensing** (Phase 5) - Cryptographically signed offline licenses
- ✅ **Usage Tracking** - Track metrics and enforce limits
- ✅ **Caching** - Built-in response caching for performance

## Quick Start

```typescript
import { LicenseFlowClient } from 'licenseflow';

const client = new LicenseFlowClient({
  apiKey: 'lf_live_xxxxxxxxxxxx', // Generated from the SaaS platform
  baseUrl: 'https://your-project.supabase.co'
});

// Activate license
const activation = await client.activate({
  licenseKey: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId()
});

console.log('Activated:', activation.success);

// Verify license
const verification = await client.verify({
  licenseKey: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId()
});

console.log('Valid:', verification.valid);
```

## Phase 5: Entitlements

Check feature access based on license tier:

```typescript
const verification = await client.verify({licenseKey: 'XXX'});

// Check boolean feature
if (client.hasFeature(verification, 'ai_features')) {
  // Enable AI assistant
  enableAI();
}

// Get numeric limit
const limit = client.getEntitlement(verification, 'api_rate_limit')?.limit || 1000;
console.log(`Your rate limit: ${limit} requests/hour`);

// Get string value
const resolution = client.getEntitlement(verification, 'max_export_resolution')?.value;
console.log(`Max resolution: ${resolution}`); // "4k", "8k", etc.
```

## Phase 5: Release Management

Check for updates and download new versions:

```typescript
// Check for updates
const update = await client.checkForUpdates({
  currentVersion: 'v1.5.0',
  product_id: 'your-product-id',
  channel: 'stable' // or 'beta', 'alpha', 'nightly'
});

if (update) {
  console.log(`New version available: ${update.version}`);
  console.log('Changelog:', update.changelog);
  
  // Download with license
  const download = await client.downloadArtifact({
    licenseKey: 'XXXX-XXXX',
    release_id: update.id,
    platform: process.platform, // 'darwin', 'win32', 'linux'
    architecture: process.arch // 'x64', 'arm64'
  });
  
  console.log('Download URL:', download.url); // Valid for 15 minutes
  console.log('SHA-256:', download.checksum_sha256);
}
```

## Phase 5: Offline Licensing

Verify licenses without internet access:

```typescript
import fs from 'fs';

const licenseFile = fs.readFileSync('license.lic', 'utf8');
const publicKey = 'YOUR_ORG_PUBLIC_KEY_HEX';

try {
  const license = await client.verifyOfflineLicense(licenseFile, publicKey);
  
  console.log('Offline license valid!');
  console.log('Customer:', license.customer_name);
  console.log('Entitlements:', license.entitlements);
  console.log('Valid until:', license.valid_until);
} catch (error) {
  console.error('Invalid offline license:', error.message);
}
```

## API Reference

### Client Methods

#### `activate(payload)`
Activate a license on a device.

```typescript
const result = await client.activate({
  licenseKey: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId(),
  metadata: { /* optional */ }
});
```

#### `verify(payload)`
Verify a license status.

```typescript
const result = await client.verify({
  licenseKey: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId()
});
```

#### `deactivate(payload)`
Deactivate a license from a device.

```typescript
await client.deactivate({
  licenseKey: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId()
});
```

#### `hasFeature(verification, featureCode)`
**Phase 5:** Check if a feature is enabled.

```typescript
if (client.hasFeature(verification, 'premium_support')) {
  // Show premium support option
}
```

#### `getEntitlement(verification, featureCode)`
**Phase 5:** Get entitlement value.

```typescript
const value = client.getEntitlement(verification, 'storage_limit');
console.log('Storage limit:', value?.limit); // 100GB, 1TB, etc.
```

#### `checkForUpdates(opts)`
**Phase 5:** Check for software updates.

```typescript
const update = await client.checkForUpdates({
  currentVersion: 'v1.0.0',
  product_id: 'uuid',
  channel: 'stable'
});
```

#### `downloadArtifact(opts)`
**Phase 5:** Get license-gated download URL.

```typescript
const download = await client.downloadArtifact({
  licenseKey: 'XXXX-XXXX',
  release_id: 'uuid',
  platform: 'windows',
  architecture: 'x64'
});
```

#### `verifyOfflineLicense(licenseFile, publicKey)`
**Phase 5:** Verify offline license with Ed25519 signature.

```typescript
const license = await client.verifyOfflineLicense(
  licFileContents,
  orgPublicKey
);
```

#### `recordUsage(payload)`
Record usage metrics.

```typescript
await client.recordUsage({
  licenseKey: 'XXXX-XXXX',
  metric_name: 'api_calls',
  value: 1,
  increment: true
});
```

#### `getHardwareId()`
Get unique device identifier.

```typescript
const deviceId = client.getHardwareId();
```

## Configuration

```typescript
const client = new LicenseFlowClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-project.supabase.co',
  cacheTTL: 300, // Cache duration in seconds (default: 5 minutes)
  retries: 3 // Number of retries for failed requests (default: 3)
});
```

## Error Handling

```typescript
import { 
  LicenseFlowError, 
  InvalidLicenseError, 
  LicenseExpiredError,
  MaxActivationsError,
  RateLimitError,
  NetworkError
} from 'licenseflow';

try {
  await client.activate({licenseKey, device_id});
} catch (error) {
  if (error instanceof LicenseExpiredError) {
    console.error('License has expired');
  } else if (error instanceof MaxActivationsError) {
    console.error('Maximum device limit reached');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, try again later');
  }
}
```

## TypeScript Support

Fully typed with TypeScript:

```typescript
import { 
  LicenseFlowClient, 
  VerificationResponse,
  ActivationResponse,
  UpdateInfo,
  ArtifactDownload
} from 'licenseflow';
```

## Caching

The SDK automatically caches verification responses for better performance:

```typescript
// First call hits the API
const result1 = await client.verify({licenseKey, device_id});

// Second call uses cache (within TTL window)
const result2 = await client.verify({licenseKey, device_id});

// Clear cache manually
client.clearCache();
```

## Examples

See the [examples](./examples) directory for complete examples:

- Basic activation and verification
- Entitlements-based features
- Auto-update implementation
- Offline license handling

## CLI Tool

For command-line access and CI/CD integration, use the LicenseFlow CLI:

```bash
npm install -g @licenseflow/cli

# Activate license on this machine
licenseflow activate XXXX-XXXX-XXXX-XXXX --save

# CI/CD checkout (temporary lease)
licenseflow checkout XXXX-XXXX-XXXX-XXXX -r "github-$RUN_ID" -t 3600
licenseflow checkin  # Release when done

# Hardware fingerprinting
licenseflow fingerprint --simple
```

See the [CLI README](../licenseflow-cli/README.md) for full documentation.

## Migration from v1.x

### Breaking Changes

- `VerificationResponse` now includes `entitlements?: Record<string, any>`
- No other breaking changes (backward compatible)

### New in v2.0

- ✅ Entitlements system
- ✅ Release management
- ✅ Offline licensing
- ✅ Ed25519 cryptographic verification

### New in v3.0

- ✅ CLI tool integration
- ✅ License checkout/lease API for CI/CD
- ✅ Advanced hardware fingerprinting
- ✅ Subscription-based feature gating

## License

MIT

## Support

- Documentation: https://docs.licenseflow.dev
- Issues: https://github.com/licenseflow/js-sdk/issues
- Discord: https://discord.gg/licenseflow
