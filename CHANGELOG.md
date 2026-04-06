# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-02-17

### Added
- Environment scoping support: `environment_id` parameter in activation, verification, and usage payloads
- Cache isolation between environments to prevent cross-environment cache collisions
- Floating license lease methods: `checkoutLicense()`, `checkinLicense()`, `getLeaseStatus()`
- Credit system methods: `consumeCredits()`, `getCreditsBalance()`
- Entitlement management: `listEntitlements()`, `createEntitlement()`, `updateEntitlement()`, `deleteEntitlement()`
- Entitlement assignment: `assignEntitlementToLicense()`, `assignEntitlementToPolicy()`
- Heartbeat support: `startHeartbeat()`, `stopHeartbeat()`

### Changed
- Cache key format now includes environment context
- Defaults to `'default'` environment when `environment_id` is not provided

## [2.0.0] - 2025-01-19

### Added - Phase 5 Enterprise Features

#### Entitlements System
- **`hasFeature(verification, featureCode)`** - Check if license has a feature enabled
- **`getEntitlement(verification, featureCode)`** - Get entitlement value (limits, quotas, settings)
- Automatic entitlements included in `verify()` response
- Support for boolean, number, string, and JSON entitlements

#### Release Management
- **`checkForUpdates(opts)`** - Check for software updates by version and channel
- **`downloadArtifact(opts)`** - Get license-gated download URLs for binaries
- Support for multiple channels (stable, beta, alpha, nightly)
- Automatic platform/architecture detection
- SHA-256 checksum verification

#### Offline Licensing
- **`verifyOfflineLicense(licenseFile, publicKey)`** - Verify offline licenses with Ed25519 signatures
- Support for air-gapped environments
- Cryptographic signature verification (no internet required)
- Expiration checking

### Changed
- **`VerificationResponse`** now includes optional `entitlements` field
- Bumped to v2.0.0 for Phase 5 feature release
- Updated TypeScript types for new methods
- Enhanced README with Phase 5 examples

### Technical
- No new dependencies required (uses built-in Node.js crypto)
- Backward compatible (entitlements field is optional)
- Maintains existing caching and retry logic

## [1.0.0] - 2024-12-01

### Added
- Initial release
- License activation and verification
- Hardware binding
- Usage tracking
- Automatic caching with configurable TTL
- Retry logic with exponential backoff
- TypeScript support
- Error handling with custom error classes

### Features
- `activate()` - Activate license on device
- `verify()` - Verify license status
- `deactivate()` - Remove device activation
- `recordUsage()` - Track usage metrics
- `getHardwareId()` - Get unique device identifier
- `clearCache()` - Manual cache clearing

[2.0.0]: https://github.com/licenseflow/js-sdk/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/licenseflow/js-sdk/releases/tag/v1.0.0
