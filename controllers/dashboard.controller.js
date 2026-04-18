import Order from "../models/order.model.js";
import Inventory from "../models/inventory.model.js";
import Branch from "../models/branch.model.js";
import Employee from "../models/employee.model.js";
import { sendResponse } from "../utils/response.js";

export const getManagerDashboard = async (req, res, next) => {
    try {
        const branchId = req.user.branchId; 

        // Fetch Branch Stats
        const branchStats = await Branch.findById(branchId)
            .select('total_orders total_revenue name branch_code');

        // Fetch Aggregated Metrics
        const metrics = await Order.aggregate([
            { $match: { branchId: branchStats._id } },
            {
                $facet: {
                    // Count orders by status
                    "statusCounts": [
                        { $group: { _id: "$status", count: { $sum: 1 } } }
                    ],
                    // Revenue from the last 30 days
                    "recentRevenue": [
                        { 
                            $match: { 
                                payment_status: 'paid', 
                                updated_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
                            } 
                        },
                        { $group: { _id: null, total: { $sum: "$total_amount" } } }
                    ]
                }
            }
        ]);

        // Get Inventory Alerts
        const lowStock = await Inventory.find({
            branchId,
            $expr: { $lte: ["$current_stock", "$reorder_level"] }
        }).select('name current_stock unit').lean(); // Optimize read-only query

        // Staff Performance Snapshot
        const staffStats = await Employee.find({ branchId })
            .populate('userId', 'fullname')
            .select('completed_tasks assigned_tasks')
            .limit(5)
            .sort({ completed_tasks: -1 })
            .lean(); // Optimize read-only query

        return sendResponse(res, 200, true, "Dashboard data retrieved", {
            summary: {
                allTimeRevenue: branchStats.total_revenue,
                allTimeOrders: branchStats.total_orders,
                recentMonthRevenue: metrics[0].recentRevenue[0]?.total || 0
            },
            orderBreakdown: metrics[0].statusCounts,
            inventoryAlerts: lowStock,
            topStaff: staffStats
        });
    } catch (error) {
        next(error);
    }
};