# LicenseFlow JS SDK

The official TypeScript/JavaScript SDK for LicenseFlow. Robust license activation, verification, and usage tracking for your applications.

## Installation

```bash
npm install @licenseflow/sdk
```

## Quick Start

### Initialize the Client

```typescript
import { LicenseFlowClient } from '@licenseflow/sdk';

const client = new LicenseFlowClient({
  baseUrl: 'https://your-api.licenseflow.com',
  apiKey: 'your_publishable_api_key',
  jwtSecret: 'your_jwt_secret' // Optional: needed for offline validation
});
```

### Activate a License

```typescript
const response = await client.activate({
  license_key: 'XXXX-XXXX-XXXX-XXXX',
  device_id: 'unique_device_id',
  device_name: 'Developer Laptop',
  hardware_fingerprint: { /* optional fingerprint data */ }
});

if (response.success) {
  console.log('License activated!', response.proof);
  // Store response.proof for offline validation
}
```

### Verify a License (Online)

```typescript
const status = await client.verify({
  license_key: 'XXXX-XXXX-XXXX-XXXX',
  device_id: 'unique_device_id'
});

if (status.valid) {
  console.log('License is valid');
}
```

### Validate Proof (Offline)

```typescript
const result = await client.validateProofOffline(storedProof);

if (result.valid) {
  console.log('Offline proof verified:', result.payload);
}
```

### Track Usage

```typescript
await client.recordUsage({
  license_key: 'XXXX-XXXX-XXXX-XXXX',
  metric_name: 'api_requests',
  value: 1,
  increment: true
});
```

## Features

- **Multi-Environment Support**: Works in Node.js, Browsers, and Electron.
- **Hardware Binding**: Support for custom hardware fingerprints.
- **Offline Resilience**: Built-in JWT verification for signed license proofs.
- **Usage Analytics**: Easily track feature consumption and API calls.
- **Developer Sandbox**: Toggle `is_test` for development without affecting production metrics.

## License

ISC
