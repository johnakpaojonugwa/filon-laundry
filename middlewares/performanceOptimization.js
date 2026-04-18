import compression from 'compression';
import { logger } from '../utils/logger.js';

// Compression middleware
export const compressionMiddleware = compression({
    filter: (req, res) => {
        // Compress responses with content-type: application/json
        if (req.headers['x-no-compression']) {
            return false;
        }

        const contentType = res.getHeader('content-type');
        if (contentType && !contentType.includes('application/json')) {
            return false;
        }

        return true;
    },
    level: 6, // Balance between compression ratio and CPU usage
    threshold: 1000 // Don't compress responses < 1KB
});

// Performance monitoring middleware
export const performanceMonitor = (req, res, next) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    // Override res.json to capture timing
    const originalJson = res.json.bind(res);
    res.json = function (data) {
        const duration = Date.now() - startTime;
        const memoryDelta = process.memoryUsage().heapUsed - startMemory;

        // Add performance headers
        res.setHeader('X-Response-Time', `${duration}ms`);

        // Log slow requests (> 500ms)
        if (duration > 500) {
            logger.warn('SLOW REQUEST', {
                method: req.method,
                path: req.path,
                duration: `${duration}ms`,
                memoryDelta: `${(memoryDelta / 1024).toFixed(2)}KB`,
                statusCode: res.statusCode
            });
        }

        // Log very slow requests (> 2s)
        if (duration > 2000) {
            logger.error('VERY SLOW REQUEST', {
                method: req.method,
                path: req.path,
                duration: `${duration}ms`,
                statusCode: res.statusCode
            });
        }

        return originalJson(data);
    };

    next();
};

// Memory usage monitoring
let lastCriticalAlert = 0;
let lastWarningAlert = 0;

export const memoryMonitor = () => {
    return setInterval(() => {
        const memUsage = process.memoryUsage();
        const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        const now = Date.now();

        // Only log critical alerts once per 2 minutes when heap exceeds 95%
        if (heapPercent > 95) {
            if (now - lastCriticalAlert > 120000) {
                logger.error('CRITICAL: Heap memory above 95%', {
                    heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                    heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
                    heapPercent: `${heapPercent.toFixed(2)}%`
                });
                lastCriticalAlert = now;
            }
        } else if (heapPercent > 85) {
            // Only log warnings once per 3 minutes to avoid spam
            if (now - lastWarningAlert > 180000) {
                logger.warn('WARNING: Heap memory above 85%', {
                    heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                    heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
                    heapPercent: `${heapPercent.toFixed(2)}%`
                });
                lastWarningAlert = now;
            }
        }
    }, 60000); // Check every 60 seconds (less frequent)
};

// Histogram for response times
export class ResponseTimeHistogram {
    constructor() {
        this.buckets = {
            '0-50ms': 0,
            '50-100ms': 0,
            '100-500ms': 0,
            '500-1000ms': 0,
            '1000-2000ms': 0,
            '2000+ms': 0
        };
    }

    record(duration) {
        const thresholds = [
            { limit: 50, label: '0-50ms' },
            { limit: 100, label: '50-100ms' },
            { limit: 500, label: '100-500ms' },
            { limit: 1000, label: '500-1000ms' },
            { limit: 2000, label: '1000-2000ms' }
        ];

        // Find the first threshold that is greater than or equal to the duration
        const bucket = thresholds.find(t => duration <= t.limit);

        if (bucket) {
            this.buckets[bucket.label]++;
        } else {
            this.buckets['2000+ms']++;
        }
    }

    getStats() {
        const total = Object.values(this.buckets).reduce((a, b) => a + b, 0);
        if (total === 0) return { total: 0, distribution: {} };

        const distribution = {};
        for (const [bucket, count] of Object.entries(this.buckets)) {
            distribution[bucket] = `${((count / total) * 100).toFixed(2)}%`;
        }

        return { total, distribution };
    }

    reset() {
        for (const bucket of Object.keys(this.buckets)) {
            this.buckets[bucket] = 0;
        }
    }
}

export const histogram = new ResponseTimeHistogram();

// Middleware to record response times
export const recordResponseTime = (req, res, next) => {
    const startTime = Date.now();

    const originalJson = res.json.bind(res);
    res.json = function (data) {
        const duration = Date.now() - startTime;
        histogram.record(duration);
        return originalJson(data);
    };

    next();
};

// Endpoint to get performance stats
export const getPerformanceStats = (req, res, next) => {
    const stats = histogram.getStats();
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    return res.json({
        success: true,
        data: {
            responseTimeDistribution: stats.distribution,
            totalRequests: stats.total,
            memoryUsage: {
                heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
                external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
                rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`
            },
            uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
            nodeVersion: process.version
        }
    });
};
