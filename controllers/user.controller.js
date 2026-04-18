import mongoose from "mongoose";
import User from "../models/user.model.js";
import Branch from "../models/branch.model.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import { sanitizeForRegex } from "../utils/validators.js";

// Create new user
export const createUser = async (req, res, next) => {
    try {
        const { fullname, email, phone_number, password, address, role, branchId } = req.body;
        const avatar = req.files?.avatar?.[0]?.path;

        // Branch assignment logic based on role
        let assignedBranchId = branchId;
        if (!assignedBranchId && req.user.role === "branch_manager") {
            assignedBranchId = req.user.branchId;
        }

        if (req.user.role === 'branch_manager' && role === 'branch_manager') {
            return sendError(res, 403, "Branch managers are not allowed to create other branch managers");
        }

        if(role !== 'customer' && !assignedBranchId) {
            return sendError(res, 400, "Branch ID is required for non-customer roles");
        }

        const existingUser = await User.findOne({ $or: [{ email }, { phone_number }] });
        if (existingUser) {
            return sendError(res, 400, "Email or Phone number already in use");
        }

        // Create the user
        const newUser = new User({
            fullname,
            email: email.toLowerCase().trim(),
            phone_number: phone_number.trim(),
            password,
            address: address.trim(),
            role: role || 'customer',
            branchId: assignedBranchId || null,
            avatar
        });

        await newUser.save();

        return sendResponse(res, 201, true, "User created successfully", newUser);
    } catch (error) {
        logger.error("Create user error:", error.message);
        next(error);

    }
}

// Create branch manager (super_admin only)
export const createBranchManager = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            fullname,
            email,
            phone_number,
            password,
            address,
            designation,
            department,
            branchId
        } = req.body;

        const avatar = req.files?.avatar?.[0]?.path;

        if (!branchId) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 400, "Branch ID is required for branch manager");
        }

        const branch = await Branch.findById(branchId).session(session);
        if (!branch) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 404, "Branch not found");
        }

        // Ensure branch doesn't already have a manager
        if (branch.manager) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 409, "This branch already has an assigned manager");
        }

        // Check for existing email or phone number conflicts
        const existingConflict = await User.findOne({
            $or: [
                { email: email?.toLowerCase()?.trim() },
                { phone_number: phone_number?.trim() }
            ]
        }).session(session);
        if (existingConflict) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 400, "Email or Phone number already in use");
        }

        const existingBranchManager = await User.findOne({ role: 'branch_manager', branchId }).session(session);
        if (existingBranchManager) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 409, "This branch already has an assigned manager");
        }

        // Create the Branch Manager user
        const newManager = new User({
            fullname: fullname?.trim(),
            email: email?.toLowerCase()?.trim(),
            phone_number: phone_number?.trim(),
            password,
            address: address?.trim(),
            role: 'branch_manager',
            designation: designation?.trim(),
            department: department?.trim(),
            branchId,
            avatar,
            status: 'active'
        });

        await newManager.save({ session });

        // Link branch to manager
        branch.manager = newManager._id;
        await branch.save({ session });

        await session.commitTransaction();
        session.endSession();

        return sendResponse(res, 201, true, "Branch manager created successfully", newManager);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error("Create branch manager error:", error.message);
        next(error);
    }
};

// Get branch manager
export const getBranchManagers = async (req, res, next) => {
    try {
        const query = { role: 'branch_manager' };

        if (req.user.role === 'branch_manager') {
            if (!req.user.branchId) return sendError(res, 403, "Manager is not assigned to a branch");
            query.branchId = new mongoose.Types.ObjectId(req.user.branchId);
        }

        if (req.query.branchId) {
            query.branchId = new mongoose.Types.ObjectId(req.query.branchId);
        }

        if (req.query.search) {
            const safeSearch = sanitizeForRegex(req.query.search);
            query.$or = [
                { fullname: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const skip = (page - 1) * limit;

        // Fetch managers and total count in parallel for pagination
        const [managers, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .populate('branchId', 'name address')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean(), // Optimize read-only query
            User.countDocuments(query)
        ]);

        return sendResponse(res, 200, true, "Branch managers retrieved successfully", {
            pagination: { total, page, pages: Math.ceil(total / limit) },
            managers
        });
    } catch (error) {
        logger.error("Get branch managers error:", error.message);
        next(error);
    }
};

// Get single branch manager by ID
export const getBranchManagerById = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const manager = await User.findById(userId).select('-password').populate('branchId', 'name');

        if (!manager || manager.role !== 'branch_manager') {
            return sendError(res, 404, "Branch manager not found");
        }

        // Branch managers can only access their own profile
        const managerBranchId = manager.branchId?._id ? manager.branchId._id.toString() : manager.branchId?.toString();
        if (req.user.role === 'branch_manager' && managerBranchId !== req.user.branchId?.toString()) {
            return sendError(res, 403, "Access denied");
        }

        return sendResponse(res, 200, true, "Branch manager retrieved", { manager });
    } catch (error) {
        logger.error("Get branch manager by id error:", error.message);
        next(error);
    }
};

// Update branch manager
export const updateBranchManager = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { fullname, email, phone_number, address, designation, department, branchId, status } = req.body;
        const avatar = req.files?.avatar?.[0]?.path;

        const manager = await User.findById(userId);
        if (!manager || manager.role !== 'branch_manager') {
            return sendError(res, 404, "Branch manager not found");
        }

        // Branch managers can only update their own profile
        const updates = {};
        if (fullname) updates.fullname = fullname.trim();
        if (email) updates.email = email.trim().toLowerCase();
        if (phone_number) updates.phone_number = phone_number.trim();
        if (address) updates.address = address.trim();
        if (designation) updates.designation = designation.trim();
        if (department) updates.department = department.trim();
        if (avatar) updates.avatar = avatar;
        if (status) updates.status = status;

        if (branchId && branchId !== manager.branchId?.toString()) {
            const targetBranch = await Branch.findById(branchId);
            if (!targetBranch) {
                return sendError(res, 404, "Target branch not found");
            }

            const existingManager = await User.findOne({ role: 'branch_manager', branchId, _id: { $ne: manager._id } });
            if (existingManager) {
                return sendError(res, 409, "Target branch already has a manager");
            }

            updates.branchId = branchId;

            // Clear previous branch assignment
            if (manager.branchId) {
                await Branch.findByIdAndUpdate(manager.branchId, { $unset: { manager: 1 } });
            }

            targetBranch.manager = manager._id;
            await targetBranch.save();
        }

        if (Object.keys(updates).length === 0) {
            return sendError(res, 400, "No changes detected");
        }

        Object.assign(manager, updates);
        await manager.save();

        return sendResponse(res, 200, true, "Branch manager updated", manager);
    } catch (error) {
        if (error.code === 11000) {
            return sendError(res, 400, "Email or Phone number already in use");
        }
        logger.error("Update branch manager error:", error.message);
        next(error);
    }
};

// Delete branch manager
export const deleteBranchManager = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const manager = await User.findById(userId);

        if (!manager || manager.role !== 'branch_manager') {
            return sendError(res, 404, "Branch manager not found");
        }

        if (manager.branchId) {
            await Branch.findByIdAndUpdate(manager.branchId, { $unset: { manager: 1 } });
        }

        await manager.deleteOne();
        return sendResponse(res, 200, true, "Branch manager deleted");
    } catch (error) {
        logger.error("Delete branch manager error:", error.message);
        next(error);
    }
};

// Get all users
export const getAllUsers = async (req, res, next) => {
    try {
        const query = {};

        if (req.user.role === "branch_manager") {
            // Branch managers should only see STAFF, not other managers or admins
            query.role = { $in: ['STAFF'] };
            // Convert branchId to ObjectId for proper MongoDB comparison
            if (req.user.branchId) {
                query.branchId = new mongoose.Types.ObjectId(req.user.branchId);
            }
        } else if (req.user.role === "super_admin") {
            // Super admins see all non-customer roles
            query.role = { $ne: 'customer' };
            if (req.query.branchId) {
                query.branchId = new mongoose.Types.ObjectId(req.query.branchId);
            }
        }

        // Search Logic
        if (req.query.search) {
            const safeSearch = sanitizeForRegex(req.query.search);
            query.$or = [
                { fullname: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        // Pagination Logic
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            User.find(query)
                .select("-password -__v")
                .populate("branchId", "name location")
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean(), // Optimize read-only query
            User.countDocuments(query)
        ]);

        logger.info(`Users fetched by ${req.user.role}: ${users.length}`);

        return sendResponse(res, 200, true, "Users retrieved successfully", {
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            },
            employees: users
        });
    } catch (error) {
        logger.error("Get all users error:", error.message);
        next(error);
    }
};

// Get all customers
export const getCustomers = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;

        // Validate and safe pagination parameters
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
        const skip = (pageNum - 1) * limitNum;

        const query = { role: 'customer' };

        // Branch isolation for Customers
        if (req.user.role === "branch_manager") {
            if (!req.user.branchId) return sendError(res, 403, "Manager not assigned to a branch");
            query.branchId = new mongoose.Types.ObjectId(req.user.branchId);
        }

        // Search by name or email
        if (search) {
            const safeSearch = sanitizeForRegex(search);
            query.$or = [
                { fullname: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        const [customers, total] = await Promise.all([
            User.find(query)
                .select("-password")
                .limit(limitNum)
                .skip(skip)
                .sort({ created_at: -1 })
                .lean(), // Optimize read-only query
            User.countDocuments(query)
        ]);

        return sendResponse(res, 200, true, "Customers retrieved successfully", {
            customers,
            pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        logger.error("Get customers error:", error.message);
        next(error);
    }
};

// Get single user
export const getSingleUser = async (req, res, next) => {
    try {
        const targetId = req.params.userId || req.user.id;

        if (!mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({ 
            success: false, 
            message: "Invalid User ID format" 
        });
    }

        const user = await User.findById(targetId).select("-password").populate("branchId", "name");

        if (!user) {
            return sendError(res, 404, "User not found");
        }

        // Authorization checks
        const isOwnProfile = req.user.id === user._id.toString();
        const isSuperAdmin = req.user.role === "super_admin";
        
        const targetBranchId = user.branchId?._id?.toString() || user.branchId?.toString();
        const isBranchManager = req.user.role === "branch_manager" &&
            targetBranchId === req.user.branchId?.toString();

        if (isOwnProfile || isSuperAdmin || isBranchManager) {
            const { _id, fullname, email, phone_number, address, role, branchId, avatar } = user;
            
            logger.info("User profile accessed", { accessedBy: req.user.id, targetId: _id });

            return sendResponse(res, 200, true, "User details retrieved", { 
                user: { _id, fullname, email, phone_number, address, role, branchId, avatar } 
            });
        }

        return sendError(res, 403, "Access denied: Unauthorized profile access");
    } catch (error) {
        next(error);
    }
};

// update user details (Admin/Manager)
export const updateUser = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ 
            success: false, 
            message: "Invalid User ID format" 
        });
    }
        const { fullname, email, phone_number, address, role, designation, department, branchId } = req.body;
        const avatar = req.files?.avatar?.[0]?.path;

        const user = await User.findById(userId);
        if (!user) return sendError(res, 404, "User not found");

        // Authorization check for Managers
        if (req.user.role === "branch_manager") {
            if (user.branchId?.toString() !== req.user.branchId?.toString()) {
                return sendError(res, 403, "Managers can only update staff in their own branch");
            }
            if (user.role === "super_admin") {
                return sendError(res, 403, "Managers cannot modify Super Admins");
            }
        }

        // Only Super Admins can change roles and branch assignments
        const updates = {};
        if (fullname) updates.fullname = fullname.trim();
        if (email) updates.email = email.trim().toLowerCase();
        if (phone_number) updates.phone_number = phone_number.trim(); 
        if (address) updates.address = address.trim();
        if (avatar) updates.avatar = avatar;
        if (designation) updates.designation = designation;
        if (department) updates.department = department;

        // Restricted fields (Super Admin only)
        if (req.user.role === "super_admin") {
            if (role) updates.role = role;
            if (branchId !== undefined) updates.branchId = branchId || null;
        }

        if (Object.keys(updates).length === 0) {
            return sendError(res, 400, "No changes detected");
        }

        Object.assign(user, updates);
        await user.save();

        return sendResponse(res, 200, true, "Update successful", { user });
    } catch (error) {
        // Handle Mongoose Duplicate Key Error (e.g., email/phone already exists)
        if (error.code === 11000) {
            return sendError(res, 400, "Email or Phone number already in use");
        }
        next(error);
    }
};

// Soft delete user (deactivate)
export const softDelete = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) return sendError(res, 404, "User not found");

        // Protection: Can't deactivate yourself
        if (req.user.id === user._id.toString()) {
            return sendError(res, 400, "You cannot deactivate your own account");
        }

        // Branch Isolation for status change
        if (req.user.role === "branch_manager" && user.branchId?.toString() !== req.user.branchId?.toString()) {
            return sendError(res, 403, "You can only manage status for staff in your branch");
        }

        // Flip status logic
        user.status = user.status === "active" ? "inactive" : "active";
        await user.save();

        logger.info(`User ${userId} status set to ${user.status} by ${req.user.id}`);
        return sendResponse(res, 200, true, `Account status changed to ${user.status}`, { status: user.status });
    } catch (error) {
        next(error);
    }
};

// Permanent delete user
export const deleteUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) return sendError(res, 404, "User not found");

        if (req.user.role !== "super_admin") {
            return sendError(res, 403, "Hard deletion is restricted to super_admin");
        }

        if (req.user.id === user._id.toString()) {
            return sendError(res, 400, "Self-deletion is not permitted");
        }

        await user.deleteOne();
        return sendResponse(res, 200, true, "User permanently removed from system");
    } catch (error) {
        next(error);
    }
};

// Update own profile (for logged-in users)
export const updateOwnProfile = async (req, res, next) => {
    try {
        const body = req.body || {};
        const { fullname, email, phone_number, address } = body;
        
        const avatar = req.files?.avatar?.[0]?.path;

        const user = await User.findById(req.user.id);
        if (!user) return sendError(res, 404, "User not found");

        // Only allow updates to certain fields for own profile
        const updates = {};
        
        if (fullname?.trim()) updates.fullname = fullname.trim();
        if (email?.trim()) updates.email = email.trim().toLowerCase();
        if (phone_number?.trim()) updates.phone_number = phone_number.trim();
        if (address?.trim()) updates.address = address.trim();
        if (avatar) updates.avatar = avatar;

        if (Object.keys(updates).length === 0) {
            return sendError(res, 400, "No changes detected");
        }

        Object.assign(user, updates);
        await user.save();

        logger.info("User updated own profile", { userId: req.user.id });
        return sendResponse(res, 200, true, "Profile updated successfully", { user });

    } catch (error) {
        if (error.code === 11000) {
            return sendError(res, 400, "Email or Phone number already in use");
        }
        next(error); 
    }
};
