import mongoose from "mongoose";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Inventory from "../models/inventory.model.js";
import Branch from "../models/branch.model.js";
import { logger } from "../utils/logger.js";
import redisService from "./redisService.js";

// getBranchMatch helper to handle both ObjectId and String branchId formats
const getBranchMatch = (branchId) => {
    if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
        const objId = new mongoose.Types.ObjectId(branchId);
        // This ensures that whether the DB has a String or an ObjectId, we find it.
        return {
            branchId: { $in: [objId, branchId.toString()] }
        };
    }
    return {};
};

// Analytics Service
export const analyticsService = {
    // GENERATE DAILY ANALYTICS
    generateDailyAnalytics: async (dateInput = new Date(), branchId = null) => {
        try {
            // Check Redis cache first (10 minute TTL)
            const date = new Date(dateInput);
            const dateStr = date.toISOString().split('T')[0];
            const cacheKey = `daily_analytics:${dateStr}:${branchId || 'all'}`;
            const cachedResult = await redisService.get(cacheKey);

            if (cachedResult) {
                logger.debug(`Cache hit for daily analytics: ${cacheKey}`);
                return JSON.parse(cachedResult);
            }

            const startOfDay = new Date(date.setUTCHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setUTCHours(23, 59, 59, 999));

            const matchStage = {
                created_at: { $gte: startOfDay, $lte: endOfDay },
                ...getBranchMatch(branchId)
            };

            // Use aggregation to get all necessary metrics in one query for performance
            const orderMetrics = await Order.aggregate([
                { $match: matchStage },
                {
                    $facet: {
                        totals: [{
                            $group: {
                                _id: null,
                                count: { $sum: 1 },
                                total_value: { $sum: "$total_amount" },
                                revenue: { $sum: { $cond: [{ $eq: ["$payment_status", "paid"] }, "$total_amount", 0] } }
                            }
                        }],
                        statusCounts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                        paymentCounts: [{ $group: { _id: "$payment_status", count: { $sum: 1 } } }],
                        peakHours: [
                            { $group: { _id: { $hour: "$created_at" }, count: { $sum: 1 } } },
                            { $sort: { count: -1 } },
                            { $limit: 3 }
                        ]
                    }
                }
            ]);

            const match = orderMetrics[0] || {};
            const totals = match.totals?.[0] || { count: 0, total_value: 0, revenue: 0 };

            const newCustomers = await User.countDocuments({
                role: 'customer',
                created_at: { $gte: startOfDay, $lte: endOfDay }
            });

            const lowStockCount = await Inventory.countDocuments({
                ...getBranchMatch(branchId),
                $expr: { $lte: ['$current_stock', '$reorder_level'] }
            });

            const safeBranchId = (branchId && mongoose.Types.ObjectId.isValid(branchId))
                ? new mongoose.Types.ObjectId(branchId)
                : null;

            // Create analytics data object
            const analyticsData = {
                date: startOfDay,
                branchId: safeBranchId,
                total_orders: totals.count,
                total_order_value: totals.total_value,
                total_revenue: totals.revenue,
                average_order_value: totals.count > 0 ? totals.total_value / totals.count : 0,
                orders_by_status: match.statusCounts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
                paid_orders: match.paymentCounts.find(payment => payment._id === 'paid')?.count || 0,
                unpaid_orders: match.paymentCounts.find(payment => payment._id === 'unpaid')?.count || 0,
                newCustomers,
                low_stock_alerts: lowStockCount,
                peak_order_hours: match.peakHours.map(hourObj => hourObj._id).join(',')
            };

            // Cache the result for 10 minutes before returning
            await redisService.set(cacheKey, JSON.stringify(analyticsData), 'EX', 600);

            // Return live data without saving to database
            return analyticsData;
        } catch (error) {
            logger.error("Daily Analytics Error:", error.message);
            throw error;
        }
    },

    // GET DASHBOARD SUMMARY
    getDashboardSummary: async (branchId = null) => {
        try {
            const cacheKey = redisService.getAnalyticsKey('dashboard', { branchId });
            const cacheTTL = 300; // 5 minutes cache

            return await redisService.getOrSet(cacheKey, async () => {
                const todayStr = new Date().toISOString().split('T')[0];
                const today = new Date(`${todayStr}T00:00:00Z`);

                const branchQuery = (branchId && mongoose.Types.ObjectId.isValid(branchId)) ? { _id: branchId } : {};
                const branches = await Branch.find(branchQuery).select('total_revenue total_orders name').lean();

                const orderMatch = getBranchMatch(branchId);

                // Combine live order stats and pending count in single aggregation
                const [aggregatedStats] = await Order.aggregate([
                    { $match: orderMatch },
                    {
                        $facet: {
                            liveStats: [
                                {
                                    $group: {
                                        _id: null,
                                        total_orders: { $sum: 1 },
                                        total_revenue: { $sum: { $cond: [{ $eq: ["$payment_status", "paid"] }, "$total_amount", 0] } }
                                    }
                                }
                            ],
                            pendingCount: [
                                { $match: { status: { $in: ['pending', 'processing', 'washing', 'drying', 'ironing'] } } },
                                { $count: "count" }
                            ],
                            // NEW: Calculate branch leaderboard when branchId is null
                            ...(branchId === null ? {
                                branchLeaderboard: [
                                    {
                                        $match: {
                                            payment_status: "paid",
                                            branchId: { $exists: true, $ne: null }
                                        }
                                    },
                                    {
                                        $group: {
                                            _id: "$branchId",
                                            total_revenue: { $sum: "$total_amount" },
                                            total_orders: { $sum: 1 }
                                        }
                                    },
                                    {
                                        $lookup: {
                                            from: "branches",
                                            localField: "_id",
                                            foreignField: "_id",
                                            as: "branchInfo"
                                        }
                                    },
                                    {
                                        $unwind: "$branchInfo"
                                    },
                                    {
                                        $project: {
                                            branchId: "$_id",
                                            name: "$branchInfo.name",
                                            total_revenue: 1,
                                            total_orders: 1
                                        }
                                    },
                                    {
                                        $sort: { total_revenue: -1 }
                                    }
                                ]
                            } : {})
                        }
                    }
                ]);

                const liveStats = aggregatedStats.liveStats[0] || { total_orders: 0, total_revenue: 0 };
                const pendingCount = aggregatedStats.pendingCount[0]?.count || 0;
                const branchLeaderboard = aggregatedStats.branchLeaderboard || [];

                const safeBranchId = (branchId && mongoose.Types.ObjectId.isValid(branchId)) ? new mongoose.Types.ObjectId(branchId) : null;

                // Generate today's analytics live instead of checking stored data
                const todayData = await analyticsService.generateDailyAnalytics(today, branchId);

                const lowStock = await Inventory.find({
                    ...getBranchMatch(branchId),
                    $expr: { $lte: ["$current_stock", "$reorder_level"] }
                }).select('name current_stock unit').lean();

                return {
                    branchInfo: safeBranchId ? branches[0] : { name: "All Branches" },
                    liveTotals: { revenue: liveStats.total_revenue, orders: liveStats.total_orders },
                    today: todayData,
                    pendingWorkload: pendingCount,
                    inventoryAlerts: lowStock,
                    branchCount: branches.length,
                    branchLeaderboard: branchLeaderboard
                };
            }, cacheTTL);
        } catch (error) {
            logger.error("Dashboard Summary Error:", error.message);
            throw error;
        }
    },

    // Cache management methods
    clearAnalyticsCache: async (branchId = null) => {
        try {
            await redisService.clearAnalyticsCache();
            logger.info(`Analytics cache cleared for branch: ${branchId || 'all'}`);
        } catch (error) {
            logger.error('Error clearing analytics cache:', error.message);
        }
    },

    clearDashboardCache: async (branchId = null) => {
        try {
            const cacheKey = redisService.getAnalyticsKey('dashboard', { branchId });
            await redisService.del(cacheKey);
            logger.info(`Dashboard cache cleared for branch: ${branchId || 'all'}`);
        } catch (error) {
            logger.error('Error clearing dashboard cache:', error.message);
        }
    },

    clearDailyAnalyticsCache: async (dateStr = null, branchId = null) => {
        try {
            const date = dateStr || new Date().toISOString().split('T')[0];
            const cacheKey = `daily_analytics:${date}:${branchId || 'all'}`;
            await redisService.del(cacheKey);
            logger.info(`Daily analytics cache cleared for ${date}, branch: ${branchId || 'all'}`);
        } catch (error) {
            logger.error('Error clearing daily analytics cache:', error.message);
        }
    },

    clearAllAnalyticsCacheForBranch: async (branchId) => {
        try {
            const dashboardKey = redisService.getAnalyticsKey('dashboard', { branchId });
            await redisService.del(dashboardKey);

            await redisService.clearAnalyticsCache();

            logger.info(`All analytics cache cleared for branch: ${branchId}`);
        } catch (error) {
            logger.error('Error clearing all analytics cache for branch:', error.message);
        }
    },

    // GET ANALYTICS PERIOD - LIVE QUERIES ONLY
    getAnalyticsPeriod: async (startDate, endDate, branchId = null) => {
        try {
            const cacheKey = redisService.getAnalyticsKey('period', {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                branchId
            });
            const cacheTTL = 600; // 10 minutes cache for period analytics

            return await redisService.getOrSet(cacheKey, async () => {
                const start = new Date(new Date(startDate).setUTCHours(0, 0, 0, 0));
                const end = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999));

                // Generate live analytics for each day in the range
                const analytics = [];
                let total_orders = 0;
                let total_revenue = 0;

                for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                    const dayStart = new Date(date.setUTCHours(0, 0, 0, 0));
                    const dayEnd = new Date(date.setUTCHours(23, 59, 59, 999));

                    const matchStage = {
                        created_at: { $gte: dayStart, $lte: dayEnd },
                        ...getBranchMatch(branchId)
                    };

                    // Use aggregation to get all necessary metrics for the day in one query for performance
                    const dayMetrics = await Order.aggregate([
                        { $match: matchStage },
                        {
                            $facet: {
                                totals: [{
                                    $group: {
                                        _id: null,
                                        count: { $sum: 1 },
                                        total_value: { $sum: "$total_amount" },
                                        revenue: { $sum: { $cond: [{ $eq: ["$payment_status", "paid"] }, "$total_amount", 0] } }
                                    }
                                }],
                                statusCounts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                                paymentCounts: [{ $group: { _id: "$payment_status", count: { $sum: 1 } } }]
                            }
                        }
                    ]);

                    const metric = dayMetrics[0];
                    const totals = metric.totals[0] || { count: 0, total_value: 0, revenue: 0 };

                    // Accumulate totals
                    total_orders += totals.count;
                    total_revenue += totals.revenue;

                    // Create daily analytics object
                    const dailyAnalytics = {
                        date: dayStart,
                        branchId: branchId ? (mongoose.Types.ObjectId.isValid(branchId) ? new mongoose.Types.ObjectId(branchId) : null) : null,
                        total_orders: totals.count,
                        total_order_value: totals.total_value,
                        total_revenue: totals.revenue,
                        average_order_value: totals.count > 0 ? totals.total_value / totals.count : 0,
                        order_by_status: metric.statusCounts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
                        paid_orders: metric.paymentCounts.find(payment => payment._id === 'paid')?.count || 0,
                        unpaid_orders: metric.paymentCounts.find(payment => payment._id === 'unpaid')?.count || 0
                    };

                    analytics.push(dailyAnalytics);
                }

                // Get new customers for the period
                const newCustomers = await User.countDocuments({
                    role: 'customer',
                    created_at: { $gte: start, $lte: end }
                });

                // Aggregate order status breakdown for logisticsCard
                const orderStatusBreakdown = await Order.aggregate([
                    { $match: { created_at: { $gte: start, $lte: end }, ...getBranchMatch(branchId) } },
                    { $group: { _id: "$status", count: { $sum: 1 } } }
                ]);

                // Aggregate service revenue breakdown for service performance
                const serviceRevenueBreakdown = await Order.aggregate([
                    {
                        $match: {
                            created_at: { $gte: start, $lte: end },
                            payment_status: "paid",
                            service_type: { $exists: true, $ne: null },
                            ...getBranchMatch(branchId)
                        }
                    },
                    {
                        $group: {
                            _id: "$service_type",
                            total_revenue: { $sum: "$total_amount" },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { total_revenue: -1 } }
                ]);

                // Transform order status data for LogisticsCard 
                const statusMap = {
                    'pending': 'pendingOrders',
                    'processing': 'processingOrders',
                    'washing': 'processingOrders',
                    'drying': 'processingOrders',
                    'ironing': 'processingOrders',
                    'ready': 'readyOrders',
                    'delivered': 'deliveredOrders',
                    'completed': 'deliveredOrders'
                };

                const orderStatusCounts = orderStatusBreakdown.reduce((acc, curr) => {
                    const fieldName = statusMap[curr._id];
                    if (fieldName) {
                        acc[fieldName] = (acc[fieldName] || 0) + curr.count;
                    }
                    return acc;
                }, {});

                // Transform service revenue data for ServicePerformanceCard
                const revenueByService = serviceRevenueBreakdown
                    .filter(item => item._id)
                    .map(item => ({
                        service_type: item._id || 'Unknown Service',
                        category: item._id || 'Unknown Service',
                        amount: Number(item.total_revenue) || 0,
                        count: item.count
                    }));

                return {
                    analytics,
                    totals: {
                        total_orders,
                        total_revenue,
                        newCustomers,
                        ...orderStatusCounts
                    },
                    revenueByService,
                    total_revenue
                };
            }, cacheTTL);
        } catch (error) {
            logger.error("Get Analytics Period Error:", error.message);
            throw error;
        }
    },

    // GET SUPER ADMIN SUMMARY
    getSuperAdminSummary: async () => {
        try {
            const companyTotals = await Branch.aggregate([
                {
                    $group: {
                        _id: null,
                        totalCompanyRevenue: { $sum: "$total_revenue" },
                        totalCompanyOrders: { $sum: "$total_orders" },
                        branchCount: { $sum: 1 }
                    }
                }
            ]);

            const criticalInventory = await Inventory.find({ $expr: { $lte: ["$current_stock", "$reorder_level"] } })
                .populate('branchId', 'name')
                .select('name current_stock unit branchId')
                .lean() // Optimize read-only query
                .limit(10);

            const recentBigOrders = await Order.find({ created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
                .populate('branchId', 'name')
                .populate('customerId', 'fullname')
                .lean() // Optimize read-only query
                .sort({ total_amount: -1 })
                .limit(5);

            return {
                overview: companyTotals[0] || { totalCompanyRevenue: 0, totalCompanyOrders: 0, branchCount: 0 },
                criticalStockAlerts: criticalInventory,
                recentActivity: recentBigOrders
            };
        } catch (error) {
            logger.error("SuperAdmin Summary Error:", error.message);
            throw error;
        }
    }
};