import express from "express";
import {
    getDashboard,
    getAnalyticsPeriod,
    getDailyAnalytics,
    getOrderTrends,
    getRevenueAnalytics,
    getCustomerAnalytics, 
    exportDashboardPDF
} from "../controllers/analytics.controller.js";
import { auth, authorize } from "../middlewares/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import redisRateLimiter from "../middlewares/redisRateLimiter.js";

const router = express.Router();

// Apply auth and analytics-specific middleware to all analytics routes
router.use(auth);
router.use(authorize('super_admin', 'branch_manager'));
router.use(redisRateLimiter.analyticsLimiter);

// Dashboard (overview)
router.get('/dashboard', asyncHandler(getDashboard));

// Analytics endpoints
router.get('/period', asyncHandler(getAnalyticsPeriod));
router.get('/daily', asyncHandler(getDailyAnalytics));

// Specific analytics
router.get('/orders/trends', asyncHandler(getOrderTrends));
router.get('/revenue', asyncHandler(getRevenueAnalytics));
router.get('/customers', asyncHandler(getCustomerAnalytics));
router.post('/export/pdf', asyncHandler(exportDashboardPDF));

export default router;
