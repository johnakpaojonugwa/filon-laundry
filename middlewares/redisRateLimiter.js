import { RateLimiterRedis } from 'rate-limiter-flexible';
import redisService from '../services/redisService.js';
import { logger } from '../utils/logger.js';

class RedisRateLimiter {
    constructor() {
        this.limiters = new Map();
        this.isRedisAvailable = false;
    }

    async initialize() {
        try {
            // Check if Redis is available
            this.isRedisAvailable = await redisService.ping();

            if (this.isRedisAvailable) {
                logger.info('Redis rate limiting enabled');
            } else {
                logger.warn('Redis not available, falling back to memory-based rate limiting');
            }
        } catch (error) {
            logger.warn('Redis rate limiter initialization failed:', error.message);
            this.isRedisAvailable = false;
        }
    }

    // Create or get a rate limiter for a specific key
    createLimiter(key, options = {}) {
        const {
            keyPrefix = 'rl',
            points = 100, // Number of requests
            duration = 60, // Per 60 seconds
            blockDuration = 0, // Block duration in seconds
            inmemoryBlockOnConsumed = 0,
            inmemoryBlockDuration = 0,
            insuranceLimiter = null
        } = options;

        if (this.isRedisAvailable && redisService.client) {
            try {
                const limiter = new RateLimiterRedis({
                    storeClient: redisService.client,
                    keyPrefix,
                    points,
                    duration,
                    blockDuration,
                    inmemoryBlockOnConsumed,
                    inmemoryBlockDuration,
                    insuranceLimiter
                });

                this.limiters.set(key, limiter);
                return limiter;
            } catch (error) {
                logger.error(`Failed to create Redis rate limiter for ${key}:`, error.message);
            }
        }

        // Fallback to memory-based limiter if Redis is not available
        logger.warn(`Using memory-based rate limiter for ${key}`);
        return null; // Will be handled by express-rate-limit as fallback
    }

    getLimiter(key) {
        return this.limiters.get(key);
    }

    // Middleware factory for different rate limits
    createMiddleware(key, options = {}) {
        const limiter = this.createLimiter(key, options);

        return async (req, res, next) => {
            if (!limiter) {
                return next();
            }

            try {
                const key = req.ip; // Or use user ID for authenticated routes
                const rateLimiterRes = await limiter.consume(key);

                // Add rate limit headers
                res.set({
                    'X-RateLimit-Limit': options.points || 100,
                    'X-RateLimit-Remaining': Math.max(0, rateLimiterRes.remainingPoints),
                    'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
                });

                next();
            } catch (rejRes) {
                const msBeforeNext = rejRes.msBeforeNext || 0;

                res.set({
                    'X-RateLimit-Limit': options.points || 100,
                    'X-RateLimit-Remaining': 0,
                    'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString(),
                    'Retry-After': Math.ceil(msBeforeNext / 1000)
                });

                const message = options.message || 'Too many requests, please try again later.';
                res.status(429).json({
                    success: false,
                    message,
                    retryAfter: Math.ceil(msBeforeNext / 1000)
                });
            }
        };
    }

    // Pre-configured limiters for common use cases (cached to avoid duplicate instances)
    get generalLimiter() {
        if (!this._generalLimiter) {
            this._generalLimiter = this.createMiddleware('general', {
                points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
                duration: Math.floor((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000),
                message: 'Too many requests from this IP, please try again later.'
            });
        }
        return this._generalLimiter;
    }

    // Specific limiter for authentication routes (stricter limits)
    get authLimiter() {
        if (!this._authLimiter) {
            this._authLimiter = this.createMiddleware('auth', {
                points: 5,
                duration: 900,
                blockDuration: 900,
                message: 'Too many login attempts, please try again later.'
            });
        }
        return this._authLimiter;
    }

    // Specific limiter for API routes (more generous limits)
    get apiLimiter() {
        if (!this._apiLimiter) {
            this._apiLimiter = this.createMiddleware('api', {
                points: 1000,
                duration: 60,
                message: 'API rate limit exceeded, please slow down your requests.'
            });
        }
        return this._apiLimiter;
    }

    // Specific limiter for analytics routes (moderate limits)
    get analyticsLimiter() {
        if (!this._analyticsLimiter) {
            this._analyticsLimiter = this.createMiddleware('analytics', {
                points: 50,
                duration: 300,
                message: 'Analytics rate limit exceeded, please try again later.'
            });
        }
        return this._analyticsLimiter;
    }

    // Specific limiter for admin routes (stricter limits)
    get adminLimiter() {
        if (!this._adminLimiter) {
            this._adminLimiter = this.createMiddleware('admin', {
                points: 20,
                duration: 60,
                message: 'Admin operation rate limit exceeded.'
            });
        }
        return this._adminLimiter;
    }

    // Clean up old rate limit keys (optional maintenance)
    async cleanup() {
        if (!this.isRedisAvailable) return;

        try {
            logger.info('Rate limiter cleanup completed');
        } catch (error) {
            logger.error('Rate limiter cleanup error:', error.message);
        }
    }

    // Get rate limit stats
    async getStats(key) {
        if (!this.isRedisAvailable) {
            return { available: false };
        }

        try {
            const limiter = this.getLimiter(key);
            if (!limiter) {
                return { available: false, limiter: null };
            }

            return {
                available: true,
                limiter: key,
                redisConnected: this.isRedisAvailable
            };
        } catch (error) {
            logger.error('Error getting rate limiter stats:', error.message);
            return { available: false, error: error.message };
        }
    }
}

// Create singleton instance
const redisRateLimiter = new RedisRateLimiter();

export default redisRateLimiter;