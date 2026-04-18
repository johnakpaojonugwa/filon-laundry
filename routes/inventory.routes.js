import express from "express";
import {
    addInventoryItem,
    getInventoryByBranch,
    updateInventoryItem,
    adjustStock,
    deleteInventoryItem,
    getLowStockItems
} from "../controllers/inventory.controller.js";
import { auth, authorize } from "../middlewares/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Apply default middleware to all inventory routes
router.use(auth);

// Low stock items - requires manager+ role
router.get('/low-stock', authorize('super_admin', 'branch_manager'), asyncHandler(getLowStockItems));

// Add inventory item - requires manager+ role
router.post('/', authorize('super_admin', 'branch_manager'), asyncHandler(addInventoryItem));

// Get inventory by branch - auth only
router.get('/branch/:branchId', asyncHandler(getInventoryByBranch));

// Update inventory item - requires manager+ role
router.put('/:itemId', authorize('super_admin', 'branch_manager'), asyncHandler(updateInventoryItem));

// Adjust inventory item - requires manager+ role
router.patch('/:itemId/adjust', authorize('super_admin', 'branch_manager'), asyncHandler(adjustStock));

// Delete inventory item - admin only
router.delete('/:itemId', authorize('super_admin'), asyncHandler(deleteInventoryItem));

export default router;
