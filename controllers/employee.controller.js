import mongoose from "mongoose";
import Employee from "../models/employee.model.js";
import User from "../models/user.model.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import { isValidEmail, isStrongPassword, sanitizeInput, isValidObjectId } from "../utils/validators.js";

// Validate onboard input
const validateOnboardInput = (data) => {
    const errors = [];
    if (!data.email || !isValidEmail(data.email)) errors.push("Valid email required");
    if (!data.password || !isStrongPassword(data.password)) errors.push("Password must be strong (8+ chars, uppercase, number, special char)");
    if (!data.phone_number || !/^\+?[1-9]\d{1,14}$/.test(data.phone_number)) errors.push("Valid phone number required");
    if (!data.fullname || data.fullname.trim().length < 3) errors.push("Full name must be at least 3 characters");
    if (!data.designation || data.designation.trim().length < 2) errors.push("Designation required");
    if (!data.department || data.department.trim().length < 2) errors.push("Department required");
    if (!data.branchId || !isValidObjectId(data.branchId)) errors.push("Valid branch ID required");
    if (!data.avatar || typeof data.avatar !== 'string') errors.push("Valid avatar URL required");
    if (!data.join_date || new Date(data.join_date) > new Date()) errors.push("Join date must be in the past");
    return errors;
};

// Create Employee
export const onboardEmployee = async (req, res, next) => {
    // Authorization: only super_admin or branch_manager
    if (!['super_admin', 'branch_manager'].includes(req.user?.role)) {
        return sendError(res, 403, "Only admins can onboard employees");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            email, password, fullname, role, phone_number,
            designation, department, branchId, join_date
        } = req.body;

        const avatar = req.files?.avatar?.[0]?.path;

        // Validate input
        const errors = validateOnboardInput({ email, password, fullname, phone_number, designation, department, branchId, avatar, join_date });
        if (errors.length > 0) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 400, "Validation failed", errors);
        }

        // Branch managers can only assign to their branch
        if (req.user.role === 'branch_manager' && String(req.user.branchId) !== String(branchId)) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 403, "You can only onboard employees to your branch");
        }

        // Prevent role privilege escalation
        const assignedRole = req.user.role === 'branch_manager' ? 'STAFF' : (role || 'STAFF');
        if (req.user.role !== 'super_admin' && !['STAFF', 'branch_manager'].includes(assignedRole)) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 403, "Invalid role assignment");
        }

        // Create User
        const [newUser] = await User.create([{
            email: email.toLowerCase().trim(),
            password,
            fullname: sanitizeInput(fullname),
            phone_number: sanitizeInput(phone_number),
            role: assignedRole,
            branchId,
            avatar
        }], { session });

        // Create Employee
        const [newEmployee] = await Employee.create([{
            userId: newUser._id,
            fullname: sanitizeInput(fullname),
            designation: sanitizeInput(designation),
            department: sanitizeInput(department),
            phone_number: sanitizeInput(phone_number),
            branchId,
            avatar,
            join_date,
            status: 'active'
        }], { session });

        await session.commitTransaction();
        session.endSession();

        logger.info(`Employee onboarded by ${req.user.id}: ${newEmployee.employee_number}`);

        return sendResponse(res, 201, true, "Employee onboarded successfully", {
            user: { id: newUser._id, email: newUser.email },
            employee: newEmployee
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error("Onboarding error:", error.message);
        next(error);
    }
};

// Get All Employees
export const getAllEmployees = async (req, res, next) => {
    try {
        const { branchId, status, department, search, page = 1, limit = 10 } = req.query;

        // Validate pagination
        const pageNum = Math.max(1, parseInt(page, 10) || 1);

        const rawLimit = parseInt(limit, 10);
        const limitNum = Math.min(100, Math.max(1, Number.isNaN(rawLimit) ? 10 : rawLimit));

        const query = {};


        // Authorization
        if (req.user.role === 'branch_manager') {
            query.branchId = req.user.branchId;
        } else if (req.user.role !== 'super_admin') {
            return sendError(res, 403, "Unauthorized to view employees");
        }

        // Apply filters with sanitization
        if (branchId && isValidObjectId(branchId)) query.branchId = branchId;
        if (status && ['active', 'on_leave', 'inactive', 'terminated'].includes(status)) query.status = status;
        if (department) query.department = sanitizeInput(department);

        // Safe regex search (prevent ReDoS)
        if (search && search.length > 0) {
            const escapedSearch = search.trim().slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { employee_number: { $regex: escapedSearch, $options: 'i' } },
                { designation: { $regex: escapedSearch, $options: 'i' } }
            ];
        }

        const skip = (pageNum - 1) * limitNum;

        const employees = await Employee.find(query)
            .select('-__v')
            .populate('userId', 'fullname email')
            .populate('reporting_managerId', 'fullname')
            .skip(skip)
            .limit(limitNum)
            .sort({ createdAt: -1 })
            .lean(); // Optimize read-only query

        const total = await Employee.countDocuments(query);

        logger.info(`Fetched ${employees.length} employees for user ${req.user.id}`);

        return sendResponse(res, 200, true, "Employees retrieved", {
            total,
            page: pageNum,
            limit: limitNum,
            employees
        });
    } catch (error) {
        logger.error("Get employees error:", error.message);
        next(error);
    }
};

// Get Single Employee
export const getEmployee = async (req, res, next) => {
    try {
        const { employeeId } = req.params;

        if (!isValidObjectId(employeeId)) {
            return sendError(res, 400, "Invalid employee ID format");
        }

        const employee = await Employee.findById(employeeId)
            .populate('userId', 'fullname email')
            .populate('reporting_managerId', 'fullname designation');

        if (!employee) {
            return sendError(res, 404, "Employee not found");
        }

        // Authorization: branch managers can only see their branch's employees
        if (req.user.role === 'branch_manager' && String(employee.branchId) !== String(req.user.branchId)) {
            return sendError(res, 403, "Unauthorized");
        }

        logger.info(`Employee retrieved by ${req.user.id}: ${employee.employee_number}`);

        return sendResponse(res, 200, true, "Employee retrieved", { employee });
    } catch (error) {
        logger.error("Get employee error:", error.message);
        next(error);
    }
};

// Update Employee
export const updateEmployee = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { employeeId } = req.params;
        if (!isValidObjectId(employeeId)) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 400, "Invalid employee ID format");
        }

        // Initial Fetch & Authorization
        const employee = await Employee.findById(employeeId).session(session);
        if (!employee) {
            await session.abortTransaction();
            return sendError(res, 404, "Employee not found");
        }

        // Branch managers can only update their branch's employees
        if (req.user.role === 'branch_manager' && String(employee.branchId) !== String(req.user.branchId)) {
            await session.abortTransaction();
            return sendError(res, 403, "You can only update employees in your branch");
        }

        // Only allow specific fields to be updated
        const updates = {};
        const userUpdates = {};
        const allowedFields = ['designation', 'department', 'reporting_managerId', 'status', 'fullname'];

        const uploadedPath = req.files?.avatar?.[0]?.path;
        if (uploadedPath) {
            updates.avatar = uploadedPath;
            userUpdates.avatar = uploadedPath;
        } else if (req.body.avatar) {
            updates.avatar = sanitizeInput(req.body.avatar);
            userUpdates.avatar = updates.avatar;
        }

        // Validate and prepare updates
        for (const field of allowedFields) {
            if (field in req.body) {
                const value = req.body[field];

                if (value === undefined || value === null) continue;

                if (['reporting_managerId'].includes(field) && !isValidObjectId(value)) {
                    await session.abortTransaction();
                    return sendError(res, 400, `Invalid ${field} format`);
                }

                if (field === 'status' && !['active', 'on_leave', 'inactive', 'terminated'].includes(value)) {
                    await session.abortTransaction();
                    return sendError(res, 400, "Invalid status value");
                }

                // Apply updates and sanitize strings
                const finalValue = typeof value === 'string' ? sanitizeInput(value) : value;
                updates[field] = finalValue;

                // Sync Fullname to User Model
                if (field === 'fullname') {
                    userUpdates.fullname = finalValue;
                }
            }
        }

        if (Object.keys(updates).length === 0 && !uploadedPath) {
            await session.abortTransaction();
            return sendError(res, 400, "No valid fields to update");
        }

        const updatedEmployee = await Employee.findByIdAndUpdate(
            employeeId,
            { $set: updates },
            { new: true, session, runValidators: true }
        ).populate('userId');

        if (Object.keys(userUpdates).length > 0) {
            await User.findByIdAndUpdate(
                employee.userId,
                { $set: userUpdates },
                { session, runValidators: true }
            );
        }

        await session.commitTransaction();
        session.endSession();
        logger.info(`Employee & User synced for: ${updatedEmployee.employee_number}`);

        return sendResponse(res, 200, true, "Employee updated successfully", {
            employee: updatedEmployee
        });

    } catch (error) {
        if (session.inAtomicityMode()) {
            await session.abortTransaction();
        }

        logger.error("Update employee error:", error.message);

        if (!res.headersSent) {
            next(error);
        }

    } finally {
        session.endSession();
    }
};

// Terminate Employee
export const terminateEmployee = async (req, res, next) => {
    try {
        const { employeeId } = req.params;
        const { termination_date, termination_reason, exit_notes } = req.body;

        if (!isValidObjectId(employeeId)) {
            return sendError(res, 400, "Invalid employee ID format");
        }

        // Validate input
        if (!termination_date) return sendError(res, 400, "Termination date is required");
        if (!termination_reason) return sendError(res, 400, "Termination reason is required");
        if (new Date(termination_date) > new Date()) return sendError(res, 400, "Termination date cannot be in the future");

        // Authorization
        if (!['super_admin', 'branch_manager'].includes(req.user?.role)) {
            return sendError(res, 403, "Unauthorized to terminate employees");
        }

        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return sendError(res, 404, "Employee not found");
        }

        // Branch managers can only terminate their branch's employees
        if (req.user.role === 'branch_manager' && String(employee.branchId) !== String(req.user.branchId)) {
            return sendError(res, 403, "You can only terminate employees in your branch");
        }

        const terminatedEmployee = await Employee.findByIdAndUpdate(
            employeeId,
            {
                $set: {
                    status: 'terminated',
                    termination_date: new Date(termination_date),
                    termination_reason: sanitizeInput(termination_reason),
                    exit_notes: sanitizeInput(exit_notes)
                }
            },
            { new: true }
        );

        logger.info(`Employee terminated by ${req.user.id}: ${terminatedEmployee.employee_number}`);

        return sendResponse(res, 200, true, "Employee terminated successfully", { employee: terminatedEmployee });
    } catch (error) {
        logger.error("Terminate employee error:", error.message);
        next(error);
    }
};

// Delete Employee
export const deleteEmployee = async (req, res, next) => {
    try {
        const { employeeId } = req.params;

        if (!isValidObjectId(employeeId)) {
            return sendError(res, 400, "Invalid employee ID format");
        }

        // Only super_admin can delete
        if (req.user?.role !== 'super_admin') {
            return sendError(res, 403, "Only super admins can delete employees");
        }

        const employee = await Employee.findById(employeeId);
        if (!employee) {
            return sendError(res, 404, "Employee not found");
        }

        await Employee.findByIdAndDelete(employeeId);

        logger.info(`Employee deleted by ${req.user.id}: ${employee.employee_number}`);

        return sendResponse(res, 200, true, "Employee deleted successfully");
    } catch (error) {
        logger.error("Delete employee error:", error.message);
        next(error);
    }
};

// Get Employee By User ID
export const getEmployeeByUserId = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!isValidObjectId(userId)) {
            return sendError(res, 400, "Invalid user ID format");
        }

        const employee = await Employee.findOne({ userId })
            .populate('userId')
            .populate('reporting_managerId');

        if (!employee) {
            return sendError(res, 404, "Employee record not found for this user");
        }

        // Authorization: can only view own data or user's in same branch/if admin
        if (req.user.role === 'customer' && String(userId) !== String(req.user.id)) {
            return sendError(res, 403, "Unauthorized");
        }

        // passed all checks, return employee
        return sendResponse(res, 200, true, "Employee fetched", employee);
    } catch (error) {
        logger.error("Get employee by user ID error:", error.message);
        next(error);
    }
};
