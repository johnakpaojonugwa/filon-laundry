import express from "express";
import {
    createBranch,
    getAllBranches,
    getBranchById,
    updateBranch,
    deleteBranch
} from "../controllers/branch.controller.js";
import { auth, authorize } from "../middlewares/authMiddleware.js";
import { validateBranchCreation, validateBranchUpdate } from "../middlewares/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Apply auth to all branch routes
router.use(auth);

// Create branch (super_admin only)
router.post('/', authorize('super_admin'), validateBranchCreation, asyncHandler(createBranch));

// Get all branches
router.get('/', asyncHandler(getAllBranches));

// Get single branch
router.get('/:branchId', asyncHandler(getBranchById));

// Update branch (super_admin only)
router.put('/:branchId', authorize('super_admin'), validateBranchUpdate, asyncHandler(updateBranch));

// Delete branch (super_admin only)
router.delete('/:branchId', authorize('super_admin'), asyncHandler(deleteBranch));

export default router;
