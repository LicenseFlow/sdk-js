const { LicenseFlowClient } = require('../dist');

async function main() {
    const client = new LicenseFlowClient({
        baseUrl: 'https://api.test',
        apiKey: 'test-api-key'
    });

    console.log('--- LicenseFlow Node.js Example ---');

    // 1. Activate
    console.log('Activating license...');
    const activation = await client.activate({
        license_key: 'DEMO-KEY',
        device_name: 'Workstation'
    });
    console.log('Result:', activation);

    // 2. Verify
    console.log('Verifying license...');
    const verify = await client.verify({ license_key: 'DEMO-KEY' });
    console.log('Is Valid:', verify.valid);

    // 3. Deactivate
    console.log('Deactivating license...');
    const deactivation = await client.deactivate({ license_key: 'DEMO-KEY' });
    console.log('Result:', deactivation);
}

main().catch(console.error);
