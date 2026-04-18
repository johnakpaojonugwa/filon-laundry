import { logger } from '../utils/logger.js';

let redisClient = null;

export const initializeCache = async (client) => {
    redisClient = client;
    logger.info('Cache layer initialized');
};

// Simple in-memory cache (fallback replacement for Redis)

class InMemoryCache {
    constructor() {
        this.cache = new Map();
        this.ttls = new Map();
        
        // Cleanup expired entries every minute to prevent memory leak
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let removedCount = 0;
            
            this.ttls.forEach((ttl, key) => {
                if (ttl < now) {
                    this.cache.delete(key);
                    this.ttls.delete(key);
                    removedCount++;
                }
            });
            
            if (removedCount > 0) {
                logger.debug(`Cache cleanup: Removed ${removedCount} expired entries`);
            }
        }, 60000); // Run every minute
    }

    async get(key) {
        const value = this.cache.get(key);
        if (value) {
            // Check if expired
            const ttl = this.ttls.get(key);
            if (ttl && ttl < Date.now()) {
                this.cache.delete(key);
                this.ttls.delete(key);
                return null;
            }
        }
        return value;
    }

    async set(key, value, ttl = 3600) {
        this.cache.set(key, value);
        if (ttl) {
            this.ttls.set(key, Date.now() + ttl * 1000);
        }
    }

    async delete(key) {
        this.cache.delete(key);
        this.ttls.delete(key);
    }

    async clear() {
        this.cache.clear();
        this.ttls.clear();
    }

    async exists(key) {
        return this.cache.has(key);
    }
}

const fallbackCache = new InMemoryCache();
const cache = redisClient || fallbackCache;


 // Cache middleware for GET requests
 // Caches successful responses based on URL and query parameters

export const cacheMiddleware = (ttl = 3600) => {
    return async (req, res, next) => {
        if (req.method !== 'GET') {
            return next();
        }

        // Skip caching if user is not authenticated
        const cacheKey = `cache:${req.method}:${req.originalUrl}`;

        try {
            const cached = await cache.get(cacheKey);
            if (cached) {
                logger.debug(`Cache HIT: ${cacheKey}`);
                res.setHeader('X-Cache', 'HIT');
                return res.json(JSON.parse(cached));
            }
        } catch (error) {
            logger.warn(`Cache retrieval error: ${error.message}`);
        }

        // Override res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = function(data) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cache.set(cacheKey, JSON.stringify(data), ttl)
                    .catch(err => logger.warn(`Cache set error: ${err.message}`));
                res.setHeader('X-Cache', 'MISS');
            }

            return originalJson(data);
        };

        next();
    };
};


// Cache key patterns for different resources
export const CACHE_KEYS = {
    ORDERS: 'orders:*',
    INVENTORY: 'inventory:*',
    USERS: 'users:*',
    BRANCHES: 'branches:*',
    ANALYTICS: 'analytics:*'
};

// Function to invalidate cache for specific patterns
export const invalidateCache = async (pattern) => {
    try {
        if (redisClient && redisClient.keys) {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(...keys);
                logger.info(`Cache invalidated for pattern: ${pattern} (${keys.length} keys)`);
            }
        } else {
            const regex = pattern.replace('*', '.*');
            for (const [key] of cache.cache.entries()) {
                if (key.match(new RegExp(regex))) {
                    await cache.delete(key);
                }
            }
            logger.info(`In-memory cache invalidated for pattern: ${pattern}`);
        }
    } catch (error) {
        logger.error(`Cache invalidation error: ${error.message}`);
    }
};

// Middleware to invalidate cache on write operations
export const invalidateCacheOnWrite = (patterns) => {
    return async (req, res, next) => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            const originalJson = res.json.bind(res);
            res.json = function(data) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    patterns.forEach(pattern => {
                        invalidateCache(pattern)
                            .catch(err => logger.warn(`Failed to invalidate cache: ${err.message}`));
                    });
                }
                return originalJson(data);
            };
        }

        next();
    };
};

// Cache stats endpoint
export const getCacheStats = async (req, res, next) => {
    try {
        const stats = {
            type: redisClient ? 'Redis' : 'In-Memory',
            size: 0,
            itemCount: 0
        };

        if (redisClient && redisClient.info) {
            const info = await redisClient.info('memory');
            stats.memoryUsage = info;
        } else {
            stats.itemCount = fallbackCache.cache.size;
            stats.memoryEstimate = '(Approximate)';
        }

        return res.json({
            success: true,
            data: { cache: stats }
        });
    } catch (error) {
        logger.error(`Cache stats error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve cache statistics'
        });
    }
};

// Manual cache invalidation endpoint (admin only)
export const invalidateCacheManually = async (req, res, next) => {
    try {
        const { pattern } = req.body;

        if (!pattern) {
            return res.status(400).json({
                success: false,
                message: 'Pattern is required'
            });
        }

        await invalidateCache(pattern);

        return res.json({
            success: true,
            message: `Cache invalidated for pattern: ${pattern}`
        });
    } catch (error) {
        logger.error(`Cache invalidation endpoint error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to invalidate cache'
        });
    }
};

export { cache };
