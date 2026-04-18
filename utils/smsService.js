import twilio from 'twilio';
import { logger } from './logger.js';

// Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const smsService = {
    /**
     * Send welcome SMS
     */
    sendWelcomeSMS: async (phoneNumber, userName) => {
        try {
            await client.messages.create({
                body: `Welcome to Filon laundry! Hi ${userName}, your account is ready. Download our app or visit our website to start managing orders.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });
            logger.info(`Welcome SMS sent to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error('Send welcome SMS error:', error.message);
            return false;
        }
    },

    /**
     * Send low-stock alert SMS
     */
    sendLowStockAlertSMS: async (phoneNumber, itemCount) => {
        try {
            await client.messages.create({
                body: `⚠️ Filon laundry Alert: ${itemCount} item(s) are running low on stock. Please log in to reorder.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });
            logger.info(`Low-stock alert SMS sent to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error('Send low-stock alert SMS error:', error.message);
            return false;
        }
    },

    /**
     * Send order status update SMS
     */
    sendOrderStatusSMS: async (phoneNumber, orderNumber, status) => {
        const statusMessages = {
            'RECEIVED': '📦 Your order has been received',
            'WASHING': '🧼 Your order is being washed',
            'DRYING': '🌬️ Your order is being dried',
            'READY': '✅ Your order is ready for pickup',
            'DELIVERED': '🚚 Your order has been delivered',
            'CANCELLED': '❌ Your order has been cancelled'
        };

        try {
            await client.messages.create({
                body: `${statusMessages[status]} (Order #${orderNumber})`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });
            logger.info(`Order status SMS sent to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error('Send order status SMS error:', error.message);
            return false;
        }
    },

    /**
     * Send OTP for authentication
     */
    sendOTP: async (phoneNumber, otp) => {
        try {
            await client.messages.create({
                body: `Your Filon verification code is: ${otp}. Do not share this with anyone.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });
            logger.info(`OTP sent to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error('Send OTP error:', error.message);
            return false;
        }
    },

    /**
     * Send payment reminder SMS
     */
    sendPaymentReminderSMS: async (phoneNumber, orderNumber, amount) => {
        try {
            await client.messages.create({
                body: `💰 Payment Reminder: Order #${orderNumber} is due. Amount: $${amount}. Pay now to avoid delay.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });
            logger.info(`Payment reminder SMS sent to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error('Send payment reminder SMS error:', error.message);
            return false;
        }
    }
};
