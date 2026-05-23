import { LicenseFlowClient } from "../../dist/index.js";

const baseUrl = process.env.LICENSEFLOW_API_URL;
const apiKey = process.env.LICENSEFLOW_API_KEY;
const licenseKey = process.env.LICENSE_KEY;
const revokedKey = process.env.REVOKED_LICENSE_KEY;
if (!baseUrl || !apiKey || !licenseKey || !revokedKey) {
  console.error("Missing required env vars"); process.exit(2);
}
const client = new LicenseFlowClient({ baseUrl, apiKey });

const assert = (cond, msg) => { if (!cond) { console.error("ASSERT:", msg); process.exit(1); } };

const activation = await client.activate({ license_key: licenseKey, device_name: "ci-js" });
assert(activation && (activation.success || activation.activation_id), "activation failed");

const verify = await client.verify({ license_key: licenseKey });
assert(verify.valid === true, "active license should verify");

const ent = await client.entitlements?.({ license_key: licenseKey });
if (ent) assert(Array.isArray(ent.features ?? []), "entitlements shape");

const revoked = await client.verify({ license_key: revokedKey });
assert(revoked.valid === false, "revoked license must not verify");

await client.deactivate({ license_key: licenseKey });
console.log("JS SDK E2E ✓");