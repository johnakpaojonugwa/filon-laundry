import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

class RedisService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
    }

    // Connect to Redis with retry logic
    async connect() {
        const isLocalDev = process.env.NODE_ENV === 'development';
        const hasRedisUrl = !!process.env.REDIS_URL;

        // If we are in dev and don't have a URL, or if we want to skip Redis locally:
        if (isLocalDev && !hasRedisUrl) {
            logger.info('Skipping Redis connection in development mode (Memory fallback active)');
            this.isConnected = false;
            this.client = null;
            return null; // Exit early
        }
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

            this.client = new Redis(redisUrl, {
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: null,
                // This handles the low-level reconnection logic
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    if (times > this.maxRetries) {
                        logger.error('Redis retry strategy exhausted. Giving up.');
                        return null;
                    }
                    return delay;
                },
                lazyConnect: true,
                reconnectOnError: (err) => {
                    logger.warn('Redis reconnect on error:', err.message);
                    return err.message.includes('READONLY');
                },
                retryDelayOnClusterDown: 1000,
                clusterRetryDelay: 1000,
            });

            // Event handlers
            this.client.on('connect', () => {
                logger.info('Redis connected successfully');
                this.isConnected = true;
                this.retryCount = 0;
            });

            this.client.on('ready', () => {
                logger.info('Redis connection ready');
            });

            this.client.on('error', (err) => {
                logger.error('Redis connection error:', err.message);
                this.isConnected = false;
            });

            this.client.on('close', () => {
                logger.warn('Redis connection closed');
                this.isConnected = false;
            });

            this.client.on('reconnecting', () => {
                logger.info('Redis reconnecting...');
            });

            await this.client.connect();
            return this.client;

        } catch (error) {
            this.retryCount++;
            this.isConnected = false;
            logger.error(`Redis connection failed (attempt ${this.retryCount}/${this.maxRetries}):`, error.message);

            if (this.retryCount < this.maxRetries) {
                logger.info(`Retrying Redis connection in 5 seconds...`);
                setTimeout(() => this.connect(), 5000);
            } else {
                logger.warn('⚠️ Max Redis connection retries reached. Running without Redis caching.');
                this.client = null;
            }
        }
    }

    // Disconnect from Redis
    async disconnect() {
        if (this.client) {
            try {
                await this.client.quit();
                logger.info('Redis disconnected successfully');
            } catch (error) {
                logger.error('Error disconnecting Redis:', error.message);
            } finally {
                this.client = null;
                this.isConnected = false;
            }
        }
    }

    // Generic cache operations
    async get(key) {
        if (!this.isConnected || !this.client) return null;

        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.error('Redis GET error:', error.message);
            return null;
        }
    }

    // Set cache with optional TTL (in seconds)
    async set(key, value, ttlSeconds = null) {
        if (!this.isConnected || !this.client) return false;

        try {
            const serializedValue = JSON.stringify(value);
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, serializedValue);
            } else {
                await this.client.set(key, serializedValue);
            }
            return true;
        } catch (error) {
            logger.error('Redis SET error:', error.message);
            return false;
        }
    }

    // Delete cache key
    async del(key) {
        if (!this.isConnected || !this.client) return false;

        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            logger.error('Redis DEL error:', error.message);
            return false;
        }
    }

    // Check if key exists
    async exists(key) {
        if (!this.isConnected || !this.client) return false;

        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            logger.error('Redis EXISTS error:', error.message);
            return false;
        }
    }

    // Cache with TTL helper
    async getOrSet(key, fetcher, ttlSeconds = 300) {
        if (!this.isConnected || !this.client) {
            return await fetcher();
        }

        try {
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }

            const fresh = await fetcher();
            await this.set(key, fresh, ttlSeconds);
            return fresh;
        } catch (error) {
            logger.error('Redis getOrSet error:', error.message);
            // Fallback to direct fetch
            return await fetcher();
        }
    }

    // Analytics-specific cache keys
    getAnalyticsKey(type, params = {}) {
        const paramStr = Object.keys(params)
            .sort()
            .map(key => `${key}:${params[key]}`)
            .join(':');
        return `analytics:${type}${paramStr ? `:${paramStr}` : ''}`;
    }

    // User-specific cache keys
    getUserKey(userId, type = 'profile') {
        return `user:${userId}:${type}`;
    }

    // Inventory cache keys
    getInventoryKey(branchId = null, type = 'list') {
        return `inventory:${type}${branchId ? `:${branchId}` : ''}`;
    }

    // Generic pattern-based cache clearing
    async clearCacheByPattern(pattern, label = 'cache') {
        if (!this.isConnected || !this.client) return;

        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
                logger.info(`Cleared ${keys.length} ${label} entries`);
            }
        } catch (error) {
            logger.error(`Error clearing ${label}:`, error.message);
        }
    }

    // Clear cache patterns
    async clearAnalyticsCache() {
        await this.clearCacheByPattern('analytics:*', 'analytics cache');
    }

    async clearUserCache(userId = null) {
        const pattern = userId ? `user:${userId}:*` : 'user:*';
        await this.clearCacheByPattern(pattern, 'user cache');
    }

    async clearInventoryCache(branchId = null) {
        const pattern = branchId ? `inventory:*:${branchId}` : 'inventory:*';
        await this.clearCacheByPattern(pattern, 'inventory cache');
    }

    // Health check
    async ping() {
        if (!this.isConnected || !this.client) return false;

        try {
            const result = await this.client.ping();
            return result === 'PONG';
        } catch (error) {
            logger.error('Redis ping error:', error.message);
            return false;
        }
    }

    // Get cache stats
    async getStats() {
        if (!this.isConnected || !this.client) {
            return { connected: false, info: null };
        }

        try {
            const info = await this.client.info();
            const dbSize = await this.client.dbsize();
            return {
                connected: true,
                dbSize,
                info: info.split('\r\n').reduce((acc, line) => {
                    if (line.includes(':')) {
                        const [key, value] = line.split(':');
                        acc[key] = value;
                    }
                    return acc;
                }, {})
            };
        } catch (error) {
            logger.error('Error getting Redis stats:', error.message);
            return { connected: false, error: error.message };
        }
    }
}

// Create singleton instance
const redisService = new RedisService();

export default redisService;