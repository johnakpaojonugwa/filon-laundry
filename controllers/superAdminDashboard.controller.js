import Order from "../models/order.model.js";
import Branch from "../models/branch.model.js";
import Inventory from "../models/inventory.model.js";
import { sendResponse } from "../utils/response.js";

export const getSuperAdminDashboard = async (req, res, next) => {
    try {
        // Overall Company Totals
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

        // Branch Comparison (The "Leaderboard")
        const branchPerformance = await Branch.find({})
            .select('name branchCode total_revenue total_orders is_active')
            .sort({ total_revenue: -1 }); // Rank by money makers

        // System-Wide Low Stock (Critical Supply Chain View)
        const criticalInventory = await Inventory.find({
            $expr: { $lte: ["$current_stock", "$reorder_level"] }
        })
        .populate('branchId', 'name')
        .select('name current_stock unit branchId')
        .limit(10);

        // Recent High-Value Orders (Last 24 Hours)
        const recentBigOrders = await Order.find({
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
        .populate('branchId', 'name')
        .populate('customerId', 'fullname')
        .sort({ total_amount: -1 })
        .limit(5);

        return sendResponse(res, 200, true, "Super Admin Dashboard retrieved", {
            overview: companyTotals[0] || { totalCompanyRevenue: 0, totalCompanyOrders: 0, branchCount: 0 },
            branchLeaderboard: branchPerformance,
            criticalStockAlerts: criticalInventory,
            recentActivity: recentBigOrders
        });
    } catch (error) {
        next(error);
    }
};