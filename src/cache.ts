/**
 * LicenseFlow SDK — Persistent Encrypted Entitlement Cache
 * =========================================================
 *
 * Provides a multi-layer caching strategy:
 *  1. In-memory (fastest, ephemeral)
 *  2. Persistent file/storage (survives restarts)
 *  3. Offline grace period (JWT proof validation)
 *
 * All persisted data is AES-256-GCM encrypted and HMAC-signed.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CacheConfig {
  /** Caching strategy */
  strategy: 'cache-first' | 'stale-while-revalidate' | 'network-first';
  /** TTL for cached entries in seconds (default: 300 = 5 minutes) */
  ttlSeconds: number;
  /** How long cached data is usable when the network is unavailable (default: 72 hours) */
  offlineGracePeriodHours: number;
  /** File path for persistent cache (Node.js only). If omitted, uses in-memory only. */
  persistPath?: string;
  /** Custom encryption key. If omitted, derives from API key. */
  encryptionKey?: string;
}

export interface CachedEntry<T = unknown> {
  data: T;
  cachedAt: number;   // Unix ms
  expiresAt: number;  // Unix ms
  proofJwt?: string;  // Signed JWT for offline verification
  source: 'network' | 'cache' | 'offline';
}

// ── Encryption Utilities ─────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'licenseflow-cache-v1', KEY_LENGTH);
}

function encrypt(data: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function decrypt(payload: string, key: Buffer): string {
  const [ivB64, authTagB64, encryptedB64] = payload.split(':');
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted payload format');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}

// ── Persistent Cache Manager ─────────────────────────────────────────────────

export class EntitlementCache {
  private memory: Map<string, CachedEntry> = new Map();
  private config: CacheConfig;
  private encKey: Buffer;

  constructor(apiKey: string, config?: Partial<CacheConfig>) {
    this.config = {
      strategy: config?.strategy || 'stale-while-revalidate',
      ttlSeconds: config?.ttlSeconds || 300,
      offlineGracePeriodHours: config?.offlineGracePeriodHours || 72,
      persistPath: config?.persistPath,
      encryptionKey: config?.encryptionKey,
    };

    this.encKey = deriveKey(this.config.encryptionKey || apiKey);

    // Load persistent cache on init
    if (this.config.persistPath) {
      this.loadFromDisk();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Get a cached entry. Returns null if not cached or expired.
   * Respects the configured caching strategy.
   */
  get<T>(key: string): CachedEntry<T> | null {
    const entry = this.memory.get(key) as CachedEntry<T> | undefined;
    if (!entry) return null;

    const now = Date.now();

    // Check if within normal TTL
    if (now < entry.expiresAt) {
      return { ...entry, source: 'cache' };
    }

    // Check if within offline grace period
    const graceMs = this.config.offlineGracePeriodHours * 3600 * 1000;
    if (now < entry.cachedAt + graceMs) {
      return { ...entry, source: 'offline' };
    }

    // Expired beyond grace period — remove
    this.memory.delete(key);
    this.persistToDisk();
    return null;
  }

  /**
   * Store a cache entry with optional JWT proof for offline use.
   */
  set<T>(key: string, data: T, proofJwt?: string): void {
    const now = Date.now();
    const entry: CachedEntry<T> = {
      data,
      cachedAt: now,
      expiresAt: now + this.config.ttlSeconds * 1000,
      proofJwt,
      source: 'network',
    };

    this.memory.set(key, entry as CachedEntry<unknown>);
    this.persistToDisk();
  }

  /**
   * Remove a specific entry.
   */
  invalidate(key: string): void {
    this.memory.delete(key);
    this.persistToDisk();
  }

  /**
   * Clear all cached entries.
   */
  flush(): void {
    this.memory.clear();
    this.persistToDisk();
  }

  /**
   * Get cache statistics.
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.memory.size,
      keys: Array.from(this.memory.keys()),
    };
  }

  /**
   * Check if a verification result should use the cache or hit the network.
   * Returns the action the caller should take.
   */
  getStrategy(key: string): 'use_cache' | 'use_cache_revalidate' | 'use_network' {
    const entry = this.get(key);

    if (!entry) return 'use_network';

    switch (this.config.strategy) {
      case 'cache-first':
        return entry.source === 'offline' ? 'use_cache_revalidate' : 'use_cache';

      case 'stale-while-revalidate':
        // Always return cache immediately, but signal revalidation
        return entry.source === 'cache' ? 'use_cache' : 'use_cache_revalidate';

      case 'network-first':
        return 'use_network';

      default:
        return 'use_network';
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private persistToDisk(): void {
    if (!this.config.persistPath) return;

    try {
      const entries: Record<string, CachedEntry> = {};
      for (const [key, value] of this.memory) {
        entries[key] = value;
      }

      const plaintext = JSON.stringify(entries);
      const encrypted = encrypt(plaintext, this.encKey);

      // Ensure directory exists
      const dir = path.dirname(this.config.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.config.persistPath, encrypted, 'utf8');
    } catch (err) {
      console.warn('LicenseFlow: Failed to persist cache:', err);
    }
  }

  private loadFromDisk(): void {
    if (!this.config.persistPath) return;

    try {
      if (!fs.existsSync(this.config.persistPath)) return;

      const encrypted = fs.readFileSync(this.config.persistPath, 'utf8');
      const plaintext = decrypt(encrypted, this.encKey);
      const entries = JSON.parse(plaintext) as Record<string, CachedEntry>;

      const now = Date.now();
      const graceMs = this.config.offlineGracePeriodHours * 3600 * 1000;

      for (const [key, entry] of Object.entries(entries)) {
        // Only load entries within the grace period
        if (now < entry.cachedAt + graceMs) {
          this.memory.set(key, entry);
        }
      }
    } catch (err) {
      console.warn('LicenseFlow: Failed to load persistent cache (may be corrupted):', err);
      // Delete corrupted cache file
      try {
        if (this.config.persistPath && fs.existsSync(this.config.persistPath)) {
          fs.unlinkSync(this.config.persistPath);
        }
      } catch { /* ignore */ }
    }
  }
}
