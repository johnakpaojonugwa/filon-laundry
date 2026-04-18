import { logger } from '../utils/logger.js';

// Global error handler middleware (must be last)
export const errorHandler = (err, req, res, next) => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    let status = err.statusCode || err.status || 500;
    let message = err.message || 'Internal Server Error';
    let errors = null;
    
    // Log full error with context
    logger.error(`${req.method} ${req.path}`, {
        status,
        message,
        userId: req.user?.id,
        stack: isDevelopment ? err.stack : undefined
    });

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        status = 400;
        message = 'Validation failed';
        errors = Object.values(err.errors).map(e => e.message);
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        status = 409;
        const field = Object.keys(err.keyPattern || {})[0] || 'field';
        message = `${field} already exists`;
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        status = 401;
        message = 'Invalid or malformed token';
    }

    // JWT expired error
    if (err.name === 'TokenExpiredError') {
        status = 401;
        message = 'Token has expired';
    }

    // Cast errors (invalid ObjectId)
    if (err.name === 'CastError') {
        status = 400;
        message = 'Invalid identifier format';
    }

    // Sanitize error message in production to avoid info leakage
    if (!isDevelopment && status === 500) {
        message = 'An error occurred. Please try again later.';
    }

    // Generic error response (never expose stack in production)
    const response = {
        success: false,
        message
    };

    if (errors) response.errors = errors;
    if (isDevelopment && status !== 401 && status !== 403) response.stack = err.stack;

    res.status(status).json(response);
};
