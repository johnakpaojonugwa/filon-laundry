import mongoose from "mongoose";
import Branch from "../models/branch.model.js";
import User from "../models/user.model.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import { analyticsService } from "../services/analyticsService.js";

export const createBranch = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, address, email, contact_number, manager, services_offered, operating_hours } = req.body;

        // Check for existing branch name
        const existingBranch = await Branch.findOne({ name }).session(session);
        if (existingBranch) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 409, "Branch with this name already exists");
        }

        // Create the Branch with NO manager first
        const [branch] = await Branch.create([{
            name,
            address,
            email,
            contact_number,
            manager: null,
            services_offered,
            operating_hours
        }], { session });

        // Link the Manager
        if (manager) {
            const managerUser = await User.findById(manager).session(session);

            // Check if the user exists
            if (!managerUser) {
                await session.abortTransaction();
                session.endSession();
                return sendError(res, 404, "Manager user not found");
            }

            // Check if the user is already managing another branch
            if (managerUser.branchId && managerUser.branchId.toString() !== branch._id.toString()) {
                await session.abortTransaction();
                session.endSession();
                return sendError(res, 400, "This user is already managing another branch");
            }

            // Update the User
            managerUser.branchId = branch._id;
            managerUser.role = 'branch_manager'; 
            await managerUser.save({ session });

            // Update the Branch to point back to the manager
            branch.manager = managerUser._id;
            await branch.save({ session });

            logger.info(`Branch ${branch.name} created and linked to manager ${managerUser.fullname}`);
        }

        await session.commitTransaction();
        session.endSession();

        const message = manager ? `Branch and Manager linked successfully` : `Branch created successfully`;
        return sendResponse(res, 201, true, message, { branch });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        logger.error("❌ DETAILED ERROR:", error); 

        return res.status(500).json({
            success: false,
            message: error.message,
            errorType: error.name
        });
    }
};

export const getAllBranches = async (req, res, next) => {
    try {
        const { is_active, page = 1, limit = 10 } = req.query;

        const query = {};
        if (is_active !== undefined) {
            query.is_active = is_active === 'true';
        }

        const skip = (page - 1) * limit;
        const branches = await Branch.find(query)
            .populate('manager', 'fullname email')
            .limit(parseInt(limit))
            .skip(skip)
            .sort({ created_at: -1 })
            .lean(); // Optimize read-only query

        const total = await Branch.countDocuments(query);

        logger.info(`Branches fetched: ${branches.length}`);
        return sendResponse(res, 200, true, "Branches retrieved", {
            branches,
            pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        logger.error("Get all branches error:", error.message);
        next(error);
    }
};

export const getBranchById = async (req, res, next) => {
    try {
        const { branchId } = req.params;

        const branch = await Branch.findById(branchId).populate('manager', 'fullname email').lean(); // Optimize read-only query

        if (!branch) {
            return sendError(res, 404, "Branch not found");
        }

        return sendResponse(res, 200, true, "Branch retrieved", { branch });
    } catch (error) {
        logger.error("Get branch error:", error.message);
        next(error);
    }
};

export const updateBranch = async (req, res, next) => {
    try {
        const { branchId } = req.params;
        const updates = req.body;

        // Find the branch first
        const branch = await Branch.findById(branchId);

        if (!branch) {
            return sendError(res, 404, "Branch not found");
        }

        // Allow only specific fields to be updated
        const allowedUpdates = ['name', 'email', 'address', 'contact_number', 'manager', 'is_active', 'services_offered', 'operating_hours'];

        Object.keys(updates).forEach((key) => {
            if (allowedUpdates.includes(key)) {
                branch[key] = updates[key];
            }
        });

        if (updates.name) {
            branch.branch_code = undefined;
        }

        await branch.save();

        await branch.populate('manager', 'fullname email');

        // Clear analytics cache for this branch
        await analyticsService.clearAllAnalyticsCacheForBranch(branchId);

        logger.info(`Branch updated: ${branch.name} (${branch.branch_code})`);
        return sendResponse(res, 200, true, "Branch updated successfully", { branch });
    } catch (error) {
        logger.error("Update branch error:", error.message);
        next(error);
    }
};

export const deleteBranch = async (req, res, next) => {
    try {
        const { branchId } = req.params;

        const branch = await Branch.findByIdAndDelete(branchId);

        if (!branch) {
            return sendError(res, 404, "Branch not found");
        }

        // Clear analytics cache for this branch
        await analyticsService.clearAllAnalyticsCacheForBranch(branchId);

        logger.info(`Branch deleted: ${branch.name}`);
        return sendResponse(res, 200, true, "Branch deleted successfully");
    } catch (error) {
        logger.error("Delete branch error:", error.message);
        next(error);
    }
};
