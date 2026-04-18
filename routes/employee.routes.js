import express from 'express';
import { auth, authorize } from '../middlewares/authMiddleware.js';
import uploadMiddleware from '../utils/upload.js';
import {
    onboardEmployee,
    getAllEmployees,
    getEmployee,
    updateEmployee,
    terminateEmployee,
    deleteEmployee,
    getEmployeeByUserId
} from '../controllers/employee.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Apply auth to all employee routes
router.use(auth);

// Create Employee (super_admin, branch_manager)
router.post('/', uploadMiddleware, authorize('super_admin', 'branch_manager'), asyncHandler(onboardEmployee));

// Get All Employees
router.get('/', asyncHandler(getAllEmployees));

// Get Employee by User ID
router.get('/user/:userId', asyncHandler(getEmployeeByUserId));

// Get Single Employee
router.get('/:employeeId', asyncHandler(getEmployee));

// Update Employee
router.put('/:employeeId', uploadMiddleware, authorize('super_admin', 'branch_manager'), asyncHandler(updateEmployee));

// Terminate Employee (super_admin and branch_manager)
router.post('/:employeeId/terminate', authorize('super_admin', 'branch_manager'), asyncHandler(terminateEmployee));

// Delete Employee (super_admin only)
router.delete('/:employeeId', authorize('super_admin'), asyncHandler(deleteEmployee));

export default router;
