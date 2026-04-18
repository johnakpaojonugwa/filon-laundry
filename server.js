import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { specs } from './config/swagger.js';
import { logger } from './utils/logger.js';
import { requestLogger, logErrorContext } from './middlewares/loggingMiddleware.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { initializeScheduledJobs } from './utils/scheduledJobs.js';
import redisService from './services/redisService.js';
import redisRateLimiter from './middlewares/redisRateLimiter.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import orderRoutes from './routes/order.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import branchRoutes from './routes/branch.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import branchManagerRoutes from './routes/branchManager.routes.js';

dotenv.config();

// Validate critical environment variables
const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
}

if (process.env.MONGO_URI && !process.env.MONGO_URI.startsWith('mongodb')) {
    console.error('Invalid MONGO_URI: Must start with mongodb:// or mongodb+srv://');
    process.exit(1);
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  JWT_SECRET is too short. Use at least 32 characters for production');
}

// Validate external service credentials
const resendFallback = !process.env.RESEND_API_KEY && process.env.SENDGRID_API_KEY;
if (resendFallback) {
    logger.warn('Using deprecated SENDGRID_API_KEY for Resend configuration. Please migrate to RESEND_API_KEY.');
}

const externalServices = {
    BREVO_API_KEY: { name: 'Brevo' },
    TWILIO_ACCOUNT_SID: { name: 'Twilio Account SID' },
    TWILIO_AUTH_TOKEN: { name: 'Twilio Auth Token' },
    CLOUD_NAME: { name: 'Cloudinary Cloud Name' },
    CLOUD_API_KEY: { name: 'Cloudinary API Key' },
    CLOUD_API_SECRET: { name: 'Cloudinary API Secret' }
};

// Check for missing service credentials
const missingServices = Object.entries(externalServices)
    .filter(([key]) => {
        if (key === 'BREVO_API_KEY' && resendFallback) {
            return false;
        }
        return !process.env[key];
    })
    .map(([_, config]) => config.name);

if (missingServices.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(`Missing required service credentials: ${missingServices.join(', ')}`);
    process.exit(1);
} else if (missingServices.length > 0) {
    logger.warn(`⚠️  Missing service credentials (non-critical in development): ${missingServices.join(', ')}`);
}

if (process.env.NODE_ENV === 'production') {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        integrations: []
    });
}

const app = express();

// Initialize Redis rate limiter BEFORE using rate limiter middleware
redisRateLimiter.initialize().catch((error) => {
    logger.warn('Redis rate limiter initialization failed, will use memory mode:', error.message);
});

// Sentry request handler
if (process.env.NODE_ENV === 'production') {
    Sentry.setupExpressErrorHandler(app);
}

// Security Middleware
app.use(helmet());

// Rate limiting with Redis fallback
app.use(redisRateLimiter.generalLimiter);

// Auth-specific rate limiting
const authLimiter = redisRateLimiter.authLimiter;

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Handle JSON parsing errors
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        logger.warn('Malformed JSON received', { url: req.url, method: req.method, ip: req.ip });
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON in request body. Please check your request format.',
            error: 'Malformed JSON'
        });
    }
    next(err);
});

// Request logging middleware
app.use(requestLogger);

// CORS configuration 
const corsOrigin = process.env.NODE_ENV === 'production'
    ? [process.env.CORS_ORIGIN, 'https://klean.vercel.app', 'http://localhost:3000'].filter(Boolean)
    : process.env.CORS_ORIGIN || '*';

app.use(cors({
    origin: corsOrigin,
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request timeout middleware
app.use((req, res, next) => {
    req.setTimeout(parseInt(process.env.REQUEST_TIMEOUT || '30000'));
    res.setTimeout(parseInt(process.env.REQUEST_TIMEOUT || '30000'));
    next();
});

// API root endpoint
app.get('/', (req, res) => {
    res.send('<h1>Filon Laundry API</h1><p>Status: Online</p>')
});

// Health check route
app.get('/api/v1/health', async (req, res) => {
    try {
        // Check database connection
        const dbStatus = mongoose.connection.readyState === 1;

        // Check Redis connection
        const redisStatus = await redisService.ping().catch(() => false);

        // Get system info
        const systemInfo = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version,
            environment: process.env.NODE_ENV || 'development'
        };

        // Construct health response
        const health = {
            success: true,
            message: 'Server is running',
            services: {
                database: dbStatus ? 'connected' : 'disconnected',
                redis: redisStatus ? 'connected' : 'disconnected',
                cache: redisStatus ? 'available' : 'unavailable'
            },
            system: systemInfo,
            timestamp: new Date().toISOString()
        };

        // Return 503 if critical services are down
        const statusCode = (dbStatus) ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        logger.error('Health check error:', error.message);
        res.status(503).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
});

// Swagger Documentation
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(specs, {
    swaggerOptions: {
        url: '/api/v1/docs.json'
    }
}));

// Swagger JSON endpoint
app.get('/api/v1/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
});

// Connect to database
connectDB();

// Initialize Redis connection
redisService.connect().catch((error) => {
    logger.warn('Redis connection failed, continuing without caching:', error.message);
});

// Initialize scheduled jobs
initializeScheduledJobs();

// Routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/branch', branchRoutes);
app.use('/api/v1/branch-managers', branchManagerRoutes);
app.use('/api/v1/employees', employeeRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Error logging middleware
app.use(logErrorContext);

// Sentry error handler 
if (process.env.NODE_ENV === 'production') {
    app.use(Sentry.expressErrorHandler());
}

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    const message = process.env.NODE_ENV === 'production'
        ? `🚀 Server is live on port ${PORT}`
        : `🚀 Server is running on port http://localhost:${PORT}`;
    logger.info(message);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
    logger.warn(`\n${signal} received. Starting graceful shutdown...`);

    server.close(() => {
        logger.info('HTTP server closed');
    });

    try {
        await mongoose.connection.close(false);
        logger.info('MongoDB connection closed');
    } catch (err) {
        logger.error('Error closing MongoDB connection:', err.message);
    }

    try {
        await redisService.disconnect();
        logger.info('Redis connection closed');
    } catch (err) {
        logger.error('Error closing Redis connection:', err.message);
    }

    setTimeout(() => {
        logger.error('Forceful shutdown triggered after 10 seconds');
        process.exit(1);
    }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
    if (process.env.NODE_ENV === 'production') {
        // process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

export default app;