import { logger } from '../utils/logger.js';

// Middleware to log incoming requests and outgoing responses
export const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Attach request ID for tracking
    req.id = requestId;
    res.id = requestId;

    // Log incoming request
    logger.info(`[${requestId}] ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        body: req.method !== 'GET' ? req.body : undefined
    });

    // Override res.json to log responses
    const originalJson = res.json.bind(res);
    res.json = function(data) {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Log response
        if (statusCode >= 400) {
            logger.warn(`[${requestId}] Response ${statusCode} - ${duration}ms`, {
                method: req.method,
                path: req.path,
                statusCode,
                duration,
                response: data
            });
        } else {
            logger.info(`[${requestId}] Response ${statusCode} - ${duration}ms`, {
                method: req.method,
                path: req.path,
                statusCode,
                duration
            });
        }

        return originalJson(data);
    };

    next();
};

// Middleware to log errors with context
export const logErrorContext = (err, req, res, next) => {
    const errorContext = {
        requestId: req.id,
        method: req.method,
        path: req.path,
        statusCode: err.statusCode || 500,
        message: err.message,
        userId: req.user?.id || 'anonymous',
        ip: req.ip,
        timestamp: new Date().toISOString()
    };

    if (err.statusCode >= 500) {
        logger.error('Server Error:', {
            ...errorContext,
            stack: err.stack
        });
    } else {
        logger.warn('Client Error:', errorContext);
    }

    next(err);
};

// Log database operations
export const logDatabaseOperation = (operation, model, data = {}) => {
    logger.info(`Database Operation: ${operation}`, {
        operation,
        model,
        timestamp: new Date().toISOString(),
        dataKeys: Object.keys(data)
    });
};

// Log authentication events
export const logAuthEvent = (event, userId, metadata = {}) => {
    logger.info(`Auth Event: ${event}`, {
        event,
        userId,
        ...metadata,
        timestamp: new Date().toISOString()
    });
};

// Log notification events
export const logNotificationEvent = (type, recipient, status) => {
    logger.info(`Notification Sent: ${type}`, {
        type,
        recipient,
        status,
        timestamp: new Date().toISOString()
    });
};
