import Notification from "../models/notification.model.js";
import LowStockAlert from "../models/lowStockAlert.model.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import { notificationService } from "../services/notificationService.js";

// Get Notifications (Filtered & Paginated)
export const getNotifications = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status, category } = req.query;
        const userId = req.user.id;

        // Strict ownership: users only see their own notifications
        const query = { userId };
        if (status) query.status = status;
        if (category) query.category = category;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [notifications, total, unread_count] = await Promise.all([
            Notification.find(query)
                .limit(parseInt(limit))
                .skip(skip)
                .sort({ created_at: -1 })
                .lean(), // Optimize read-only query
            Notification.countDocuments(query),
            Notification.countDocuments({ userId, is_read: false })
        ]);

        logger.info(`Notifications fetched for user: ${userId}`);
        return sendResponse(res, 200, true, "Notifications retrieved", {
            notifications,
            unread_count,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error("Get notifications error:", error.message);
        next(error);
    }
};

// Mark Single Notification as Read (With Ownership Check)
export const markNotificationAsRead = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        // Only update if it belongs to the logged-in user
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, userId: req.user.id },
            { is_read: true, read_at: new Date() },
            { new: true }
        );

        if (!notification) {
            return sendError(res, 404, "Notification not found or access denied");
        }

        logger.info(`Notification ${notificationId} read by ${req.user.id}`);
        return sendResponse(res, 200, true, "Notification marked as read", { notification });
    } catch (error) {
        next(error);
    }
};

// Mark All as Read
export const markAllNotificationsAsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await Notification.updateMany(
            { userId, is_read: false },
            { is_read: true, read_at: new Date() }
        );

        logger.info(`User ${userId} cleared ${result.modifiedCount} notifications`);
        return sendResponse(res, 200, true, `${result.modifiedCount} notifications marked as read`);
    } catch (error) {
        next(error);
    }
};

// Delete Notification (Security Protected)
export const deleteNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        // Ensure user owns the notification before deleting
        const notification = await Notification.findOneAndDelete({ 
            _id: notificationId, 
            userId: req.user.id 
        });

        if (!notification) {
            return sendError(res, 404, "Notification not found or access denied");
        }

        return sendResponse(res, 200, true, "Notification deleted");
    } catch (error) {
        next(error);
    }
};

// Get Low Stock Alerts (Admin/Manager Only)
export const getLowStockAlerts = async (req, res, next) => {
    try {
        const { branchId, page = 1, limit = 10, is_resolved = false } = req.query;

        const query = { is_resolved: is_resolved === 'true' };
        
        // Role-based scoping
        if (req.user.role === 'branch_manager' || req.user.role === 'staff') {
            query.branchId = req.user.branchId;
        } else if (req.user.role === 'super_admin' && branchId) {
            query.branchId = branchId;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [alerts, total] = await Promise.all([
            LowStockAlert.find(query)
                .populate('inventoryId', 'itemName currentStock unit category')
                .populate('branchId', 'name')
                .limit(parseInt(limit))
                .skip(skip)
                .sort({ alert_sent_at: -1 })
                .lean(), // Optimize read-only query
            LowStockAlert.countDocuments(query)
        ]);

        return sendResponse(res, 200, true, "Low-stock alerts retrieved", {
            alerts,
            pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        next(error);
    }
};

// Resolve Alert (Scoped to Branch)
export const resolveLowStockAlert = async (req, res, next) => {
    try {
        const { alertId } = req.params;

        // Managers can only resolve alerts for their own branch
        const query = { _id: alertId };
        if (req.user.role !== 'super_admin') {
            query.branchId = req.user.branchId;
        }

        const alert = await LowStockAlert.findOneAndUpdate(
            query,
            { is_resolved: true, resolved_at: new Date() },
            { new: true }
        ).populate('inventoryId').populate('branchId');

        if (!alert) {
            return sendError(res, 404, "Alert not found or unauthorized");
        }

        logger.info(`Alert ${alertId} resolved by ${req.user.id}`);
        return sendResponse(res, 200, true, "Alert marked as resolved", { alert });
    } catch (error) {
        next(error);
    }
};

// Manual System Check
export const manuallyTriggerLowStockCheck = async (req, res, next) => {
    try {
        if (req.user.role !== 'super_admin') {
            return sendError(res, 403, "Only super_admin can trigger a system-wide check");
        }

        notificationService.checkAndAlertLowStock();

        return sendResponse(res, 202, true, "Global low-stock check initiated in background");
    } catch (error) {
        next(error);
    }
};