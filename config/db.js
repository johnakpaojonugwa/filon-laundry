import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const DEFAULT_RETRIES = 5;

const connectWithRetry = async (uri, retries = DEFAULT_RETRIES) => {
    try {
        await mongoose.connect(uri);
        logger.info('✅ Database connected successfully.');
    } catch (error) {
        logger.error('❌ Database connection failed.', { message: error.message });
        if (retries > 0) {
            const delay = (DEFAULT_RETRIES - retries + 1) * 1000; // linear backoff
            logger.warn(`Retrying database connection in ${delay}ms...`, { retriesLeft: retries - 1 });
            await new Promise(res => setTimeout(res, delay));
            return connectWithRetry(uri, retries - 1);
        }
        logger.error('Could not connect to database after multiple attempts. Exiting.');
        process.exit(1);
    }
};

export const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        logger.error('MONGO_URI is not set. Aborting DB connection.');
        process.exit(1);
    }

    // Connection event handlers
    mongoose.connection.on('connected', () => logger.info('Mongoose connected to DB'));
    mongoose.connection.on('error', (err) => logger.error('Mongoose connection error', { message: err.message }));
    mongoose.connection.on('disconnected', () => logger.warn('Mongoose disconnected'));

    await connectWithRetry(uri);
};

export const closeDB = async () => {
    try {
        await mongoose.connection.close();
        logger.info('Database connection closed successfully.');
    } catch (error) {
        logger.error('Error closing database connection:', error.message);
    }
};