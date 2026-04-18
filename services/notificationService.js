import Notification from "../models/notification.model.js";
import LowStockAlert from "../models/lowStockAlert.model.js";
import Inventory from "../models/inventory.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Branch from "../models/branch.model.js";
import { logger } from "../utils/logger.js";
import { emailService } from "../utils/emailService.js";
import { smsService } from "../utils/smsService.js";

export const notificationService = {
    // Create and send notification
    createAndSendNotification: async (userId, type, category, data) => {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error("User not found");
            }

            const notification = await Notification.create({
                userId,
                type,
                category,
                subject: data.subject,
                message: data.message,
                recipient: data.recipient || (type === 'email' ? user.email : user.phone),
                related_orderId: data.related_orderId
            });

            // Send based on type
            let sent = false;
            try {
                if (type === 'email') {
                    sent = await emailService.sendWelcomeEmail(user); // Generic, customize as needed
                } else if (type === 'sms' && user.phone) {
                    sent = await smsService.sendWelcomeSMS(user.phone, user.fullname);
                }

                if (sent) {
                    await Notification.findByIdAndUpdate(notification._id, {
                        status: 'sent',
                        sent_at: new Date()
                    });
                    logger.info(`Notification sent: ${notification._id}`);
                }
            } catch (sendError) {
                await Notification.findByIdAndUpdate(notification._id, {
                    status: 'failed',
                    error: sendError.message
                });
                logger.error(`Failed to send notification: ${sendError.message}`);
            }

            return notification;
        } catch (error) {
            logger.error("Create notification error:", error.message);
            throw error;
        }
    },

    // Get user notifications with pagination
    getUserNotifications: async (userId, page = 1, limit = 10) => {
        try {
            const skip = (page - 1) * limit;
            const notifications = await Notification.find({ userId })
                .populate('related_orderId')
                .limit(limit)
                .skip(skip)
                .sort({ created_at: -1 });

            const total = await Notification.countDocuments({ userId });

            return {
                notifications,
                pagination: { total, page, pages: Math.ceil(total / limit) }
            };
        } catch (error) {
            logger.error("Get user notifications error:", error.message);
            throw error;
        }
    },

    // Mark notification as read
    markAsRead: async (notificationId) => {
        try {
            const notification = await Notification.findByIdAndUpdate(
                notificationId,
                { is_read: true, read_at: new Date() },
                { new: true }
            );
            return notification;
        } catch (error) {
            logger.error("Mark notification as read error:", error.message);
            throw error;
        }
    },

    // Check inventory levels and send low-stock alerts
    checkAndAlertLowStock: async () => {
        try {
            logger.info("Starting low-stock check...");

            // Find all inventory items below reorder level
            const lowStockItems = await Inventory.find({
                $expr: { $lte: ['$current_stock', '$reorder_level'] }
            }).populate('branchId');

            if (lowStockItems.length === 0) {
                logger.info("No low-stock items found");
                return;
            }

            // Group by branch
            const itemsByBranch = {};
            lowStockItems.forEach(item => {
                const branchId = item.branchId._id.toString();
                if (!itemsByBranch[branchId]) {
                    itemsByBranch[branchId] = [];
                }
                itemsByBranch[branchId].push(item);
            });

            // Send alerts for each branch
            for (const branchId in itemsByBranch) {
                const items = itemsByBranch[branchId];
                const branch = items[0].branchId;

                // Find branch manager
                const branchManager = await User.findOne({
                    branchId: branch._id,
                    role: 'branch_manager'
                });

                if (branchManager && branchManager.email) {
                    // Send email
                    await emailService.sendLowStockAlert(items, branchManager.email);

                    // Send SMS if phone available
                    if (branchManager.phone) {
                        await smsService.sendLowStockAlertSMS(branchManager.phone, items.length);
                    }

                    // Create notifications
                    for (const item of items) {
                        // Check if alert already exists
                        const existingAlert = await LowStockAlert.findOne({
                            inventoryId: item._id,
                            is_resolved: false
                        });

                        if (existingAlert) {
                            // Update existing alert
                            await LowStockAlert.findByIdAndUpdate(existingAlert._id, {
                                $inc: { alertsSent: 1 },
                                alert_sent_at: new Date()
                            });
                        } else {
                            // Create new alert
                            const alert = await LowStockAlert.create({
                                inventoryId: item._id,
                                branchId: branch._id,
                                item_name: item.item_name,
                                current_stock: item.current_stock,
                                reorder_level: item.reorder_level,
                                alert_sent_at: new Date()
                            });

                            // Create notification record
                            const notification = await Notification.create({
                                userId: branchManager._id,
                                type: 'email',
                                category: 'low_stock',
                                subject: `Low Stock Alert: ${item.item_name}`,
                                message: `${item.item_name} has dropped to ${item.current_stock} ${item.unit}. Reorder level is ${item.reorder_level} ${item.unit}.`,
                                recipient: branchManager.email,
                                status: 'SENT',
                                sent_at: new Date()
                            });

                            await LowStockAlert.findByIdAndUpdate(alert._id, {
                                $push: { notificationIds: notification._id }
                            });
                        }
                    }
                }
            }

            logger.info(`Low-stock check completed. ${lowStockItems.length} items flagged.`);
        } catch (error) {
            logger.error("Low-stock check error:", error.message);
        }
    },

    // Send order status update notification
    sendOrderStatusNotification: async (orderId) => {
        try {
            const order = await Order.findById(orderId)
                .populate('customerId')
                .populate('branchId');

            if (!order || !order.customerId) {
                throw new Error("Order or customer not found");
            }

            const customer = order.customerId;

            // Send email
            await emailService.sendOrderStatusEmail(order, customer);

            // Send SMS if available
            if (customer.phone) {
                await smsService.sendOrderStatusSMS(customer.phone, order.order_number, order.status);
            }

            // Create notification record
            await Notification.create({
                userId: customer._id,
                type: 'email',
                category: 'order_update',
                subject: `Order #${order.order_number} - ${order.status}`,
                message: `Your order status has been updated to ${order.status}`,
                recipient: customer.email,
                related_orderId: orderId,
                status: 'sent',
                sent_at: new Date()
            });

            logger.info(`Order status notification sent for order: ${orderId}`);
        } catch (error) {
            logger.error("Send order status notification error:", error.message);
        }
    },

    // Send payment reminder notification
    sendPaymentReminder: async (orderId) => {
        try {
            const order = await Order.findById(orderId)
                .populate('customerId');

            if (!order || order.payment_status === 'paid') {
                return;
            }

            const customer = order.customerId;

            // Send SMS (SMS is better for payment reminders)
            if (customer.phone_number) {
                await smsService.sendPaymentReminderSMS(
                    customer.phone_number,
                    order.order_number,
                    order.total_amount
                );

                // Create notification
                await Notification.create({
                    userId: customer._id,
                    type: 'sms',
                    category: 'payment',
                    subject: `Payment Reminder - Order #${order.order_number}`,
                    message: `Please pay $${order.total_amount} for order #${order.order_number}`,
                    recipient: customer.phone_number,
                    related_orderId: orderId,
                    status: 'SENT',
                    sent_at: new Date()
                });

                logger.info(`Payment reminder sent for order: ${orderId}`);
            }
        } catch (error) {
            logger.error("Send payment reminder error:", error.message);
        }
    }
};
