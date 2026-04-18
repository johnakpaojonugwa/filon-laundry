import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { notificationService } from '../services/notificationService.js';
import { analyticsService } from '../services/analyticsService.js';
import Order from '../models/order.model.js';
import Notification from '../models/notification.model.js';

// Execute jobs with retry
const executeJobWithRetry = async (job, jobName, maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await job();
            return; // Success
        } catch (error) {
            lastError = error;
            logger.warn(`${jobName} failed (attempt ${attempt}/${maxRetries}):`, error.message);
            
            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt - 1) * 1000;
                logger.info(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    logger.error(`${jobName} failed after ${maxRetries} retries:`, lastError.message);
    // In production, send alert to monitoring system (Sentry, PagerDuty, etc.)
};

export const initializeScheduledJobs = () => {
    logger.info('Initializing scheduled jobs with retry logic...');

    // Low-stock check - Every day at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
        logger.info('Running scheduled low-stock check...');
        await executeJobWithRetry(
            () => notificationService.checkAndAlertLowStock(),
            'Low-stock check',
            3
        );
    });

    // Daily analytics generation removed - now using live queries only

    // Payment reminders - Every day at 5:00 PM
    cron.schedule('0 17 * * *', async () => {
        logger.info('Sending payment reminders...');
        await executeJobWithRetry(
            async () => {
                // Find unpaid orders that are ready
                const readyOrders = await Order.find({
                    status: 'ready',
                    paymentStatus: { $ne: 'paid' }
                });

                for (const order of readyOrders) {
                    await notificationService.sendPaymentReminder(order._id);
                }

                logger.info(`Payment reminders sent for ${readyOrders.length} orders`);
            },
            'Payment reminders',
            3
        );
    });

    // Cleanup old notifications - Every Sunday at 2:00 AM
    cron.schedule('0 2 * * 0', async () => {
        logger.info('Cleaning up old notifications...');
        await executeJobWithRetry(
            async () => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const result = await Notification.deleteMany({
                    created_at: { $lt: thirtyDaysAgo },
                    status: 'sent'
                });

                logger.info(`Deleted ${result.deletedCount} old notifications`);
            },
            'Notification cleanup',
            3
        );
    });

    logger.info('Scheduled jobs initialized successfully');
};
