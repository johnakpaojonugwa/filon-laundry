import express from "express";
import {
    getNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    getLowStockAlerts,
    resolveLowStockAlert,
    manuallyTriggerLowStockCheck
} from "../controllers/notification.controller.js";
import { auth, authorize } from "../middlewares/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Apply auth to all notification routes
router.use(auth);

// Notification endpoints
router.get('/', asyncHandler(getNotifications));
router.put('/:notificationId/read', asyncHandler(markNotificationAsRead));
router.put('/mark-all-read', asyncHandler(markAllNotificationsAsRead));
router.delete('/:notificationId', asyncHandler(deleteNotification));

// Low-stock alerts
router.get('/low-stock/alerts', authorize('super_admin', 'branch_manager'), asyncHandler(getLowStockAlerts));
router.put('/low-stock/alerts/:alertId/resolve', authorize('super_admin', 'branch_manager'), asyncHandler(resolveLowStockAlert));

// Trigger check (admin only)
router.post('/low-stock/check', authorize('super_admin'), asyncHandler(manuallyTriggerLowStockCheck));

export default router;
