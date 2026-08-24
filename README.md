# LicenseFlow Node.js SDK

[![npm version](https://img.shields.io/npm/v/licenseflow)](https://www.npmjs.com/package/licenseflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Stop Building Licensing Infrastructure. Start Shipping Software.**

The official Node.js/TypeScript SDK for [LicenseFlow](https://licenseflow.dev). Protect your intellectual property, enforce entitlements, and manage software distribution with one-line integration.

## Installation

```bash
npm install licenseflow
```

## Quick Start

```typescript
import { LicenseFlowClient } from 'licenseflow';

const client = new LicenseFlowClient({
  apiKey: 'lf_live_xxxxxxxxxxxx',
  baseUrl: 'https://api.licenseflow.dev'
});

// Activate a license on this device
const activation = await client.activate({
  license_key: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId()
});
console.log('Activated:', activation.success);

// Verify the license
const verification = await client.verify({
  license_key: 'XXXX-XXXX-XXXX-XXXX'
});
console.log('Valid:', verification.valid);
```

---

## API Reference

### Core Methods

#### `activate(payload)` — Activate a license on a device

```typescript
const result = await client.activate({
  license_key: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId(),
  device_name: 'Production Server',
  environment_id: 'env_prod' // optional
});
```

#### `verify(payload)` — Verify license status

```typescript
const result = await client.verify({
  license_key: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId(),
  environment_id: 'env_prod'
});
// Returns: { valid, status, proof, entitlements }
```

#### `deactivate(payload)` — Deactivate a license from a device

```typescript
await client.deactivate({
  license_key: 'XXXX-XXXX-XXXX-XXXX',
  device_id: client.getHardwareId()
});
```

#### `recordUsage(payload)` — Track usage metrics

```typescript
await client.recordUsage({
  license_key: 'XXXX-XXXX',
  metric_name: 'api_calls',
  value: 1,
  increment: true
});
```

#### `getHardwareId()` — Get unique device identifier

```typescript
const deviceId = client.getHardwareId(); // Returns machine-unique ID
```

---

### Entitlements

Feature flags and tier-based access control tied to licenses.

#### `hasFeature(verification, featureCode)` — Check boolean feature

```typescript
if (client.hasFeature(verification, 'ai_features')) {
  enableAI();
}
```

#### `getEntitlement(verification, featureCode)` — Get entitlement value

```typescript
const limit = client.getEntitlement(verification, 'max_users');
console.log('User limit:', limit?.limit);
```

#### `listEntitlements()` — List all entitlements in your org

```typescript
const entitlements = await client.listEntitlements();
```

#### `createEntitlement(payload)` / `updateEntitlement()` / `deleteEntitlement()`

```typescript
await client.createEntitlement({
  code: 'max_seats',
  name: 'Maximum Seats',
  type: 'integer'
});
```

#### `assignEntitlementToLicense()` / `assignEntitlementToPolicy()`

```typescript
await client.assignEntitlementToLicense(entitlementId, licenseId, { limit: 50 });
await client.assignEntitlementToPolicy(entitlementId, policyId, { limit: 10 });
```

---

### Floating Licenses (Leases)

Temporary seat-based licensing for CI/CD, concurrent users, and shared workstations.

#### `checkoutLicense(payload)` — Acquire a temporary lease

```typescript
const lease = await client.checkoutLicense({
  license_key: 'XXXX-XXXX',
  duration_seconds: 3600,
  requester_id: `ci-${process.env.CI_JOB_ID}`,
  requester_type: 'ci_runner'
});
console.log('Lease key:', lease.lease_key);
console.log('Expires:', lease.expires_at);
```

#### `checkinLicense(leaseKey)` — Release a lease early

```typescript
await client.checkinLicense(lease.lease_key);
```

#### `getLeaseStatus(leaseKey)` — Check lease state

```typescript
const status = await client.getLeaseStatus(lease.lease_key);
console.log('Status:', status.status); // 'active', 'expired', 'checked_in'
```

---

### Credits

Consumption-based billing — grant and consume credits per organization or product.

#### `consumeCredits(payload)` — Deduct credits

```typescript
const result = await client.consumeCredits({
  amount: 100,
  description: 'AI generation — 100 tokens',
  product_id: 'prod_xxx' // optional
});
console.log('Remaining:', result.remaining);
```

#### `getCreditsBalance(productId?, currency?)` — Check balance

```typescript
const balance = await client.getCreditsBalance();
console.log('Credits:', balance.balance);
```

---

### Release Management

Check for updates and download binaries gated by license.

#### `checkForUpdates(opts)` — Check for new versions

```typescript
const update = await client.checkForUpdates({
  currentVersion: 'v1.5.0',
  product_id: 'prod_xxx',
  channel: 'stable' // 'beta', 'alpha', 'nightly'
});

if (update) {
  console.log(`New version: ${update.version}`);
}
```

#### `downloadArtifact(opts)` — Get signed download URL

```typescript
const download = await client.downloadArtifact({
  licenseKey: 'XXXX-XXXX',
  release_id: update.id,
  platform: 'windows',
  architecture: 'x64'
});
console.log('URL:', download.url); // Valid for 15 minutes
console.log('SHA-256:', download.checksum_sha256);
```

---

### Offline Licensing

Verify licenses without internet using Ed25519 cryptographic signatures.

#### `verifyOfflineLicense(licenseFile, publicKey)` — Offline verification

```typescript
import fs from 'fs';

const licenseFile = fs.readFileSync('license.lic', 'utf8');
const publicKey = 'YOUR_ORG_PUBLIC_KEY_HEX';

try {
  const license = await client.verifyOfflineLicense(licenseFile, publicKey);
  console.log('Valid until:', license.valid_until);
  console.log('Entitlements:', license.entitlements);
} catch (error) {
  console.error('Invalid offline license:', error.message);
}
```

#### `validateProofOffline(proof, secret?)` — Validate JWT proof without network

```typescript
const decoded = await client.validateProofOffline(verification.proof);
```

---

### Heartbeat

Keep a license session alive with periodic pings.

#### `startHeartbeat(licenseKey, intervalMs)` — Start background heartbeat

```typescript
client.startHeartbeat('XXXX-XXXX', 60_000); // Every 60 seconds
```

#### `stopHeartbeat()` — Stop heartbeat

```typescript
client.stopHeartbeat();
```

---

## Configuration

```typescript
const client = new LicenseFlowClient({
  apiKey: 'lf_live_xxxxxxxxxxxx',
  baseUrl: 'https://api.licenseflow.dev',
  jwtSecret: 'your-jwt-secret', // For offline JWT validation
  cache: {
    ttlMs: 300_000,        // Cache TTL — 5 minutes (default)
    graceMs: 259_200_000,  // Offline grace — 72 hours (default)
    encryptKey: 'optional-aes-key' // AES-256 disk cache encryption
  },
  retries: 3               // Retry count for failed requests
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
  await client.activate({ license_key, device_id });
} catch (error) {
  if (error instanceof LicenseExpiredError) {
    console.error('License has expired');
  } else if (error instanceof MaxActivationsError) {
    console.error('Maximum device limit reached');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, retry later');
  }
}
```

## TypeScript Support

Fully typed — all methods, payloads, and responses have TypeScript definitions:

```typescript
import type {
  VerificationResponse,
  ActivationResponse,
  LeaseResponse,
  UpdateInfo,
  ArtifactDownload
} from 'licenseflow';
```

## CLI Tool

For command-line access and CI/CD integration:

```bash
npm install -g licenseflow-cli

lf activate XXXX-XXXX-XXXX-XXXX
lf checkout --feature ai_features
lf checkin  --feature ai_features
lf fingerprint
```

See the [CLI README](../licenseflow-cli/README.md) for full documentation.

## License

MIT

## Links

- 📖 [Documentation](https://docs.licenseflow.dev)
- 🐛 [Issues](https://github.com/LicenseFlow/sdk-js/issues)
- 💬 [Discord](https://discord.gg/licenseflow)
- 🏠 [Homepage](https://licenseflow.dev)
