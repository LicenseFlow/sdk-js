# @licenseflow/node-sdk

Official Node.js SDK for LicenseFlow.

## Installation

```bash
npm install @licenseflow/node-sdk
```

## Quick Start

```javascript
const { LicenseFlowClient } = require('@licenseflow/node-sdk');

const client = new LicenseFlowClient({
  baseUrl: 'https://your-project.supabase.co',
  apiKey: 'your-api-key',
  jwtSecret: 'your-jwt-secret' // Required for offline validation
});

async function main() {
  try {
    // 1. Activate License (automatically generates hardware fingerprint if node-machine-id is available)
    const activation = await client.activate({
      license_key: 'XXXX-YYYY-ZZZZ-AAAA',
      device_name: 'My Computer'
    });
    console.log('Activated:', activation.success);

    // 2. Verify License (uses internal caching for performance)
    const verification = await client.verify({
      license_key: 'XXXX-YYYY-ZZZZ-AAAA'
    });
    console.log('Valid:', verification.valid);

    // 3. Record Usage
    await client.recordUsage({
      license_key: 'XXXX-YYYY-ZZZZ-AAAA',
      metric_name: 'tokens_used',
      value: 150,
      increment: true
    });

  } catch (error) {
    if (error.name === 'RateLimitError') {
      console.error('Slow down!');
    } else if (error.name === 'InvalidLicenseError') {
      console.error('License is not valid');
    } else {
      console.error('Error:', error.message);
    }
  }
}

main();
```

## Features

- **Hardware Fingerprinting**: Built-in support for unique device identification.
- **Smart Caching**: In-memory caching of verification results with configurable TTL.
- **Automatic Retries**: Resilience against network blips with exponential backoff.
- **TypeScript First**: First-class type definitions included.
- **Offline Validation**: Validate signed proofs without an internet connection.

## License

MIT
