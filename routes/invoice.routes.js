import express from "express";
import { createInvoice, getInvoiceById, getMyInvoices, downloadInvoice } from "../controllers/invoice.controller.js";
import { auth, authorize } from "../middlewares/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Apply auth to all invoice routes
router.use(auth);

// Managers can create invoices when an order is finalized
router.post('/', authorize('super_admin', 'branch_manager'), asyncHandler(createInvoice));

// Customers can see their own, Managers can see branch invoices
router.get('/my-invoices', asyncHandler(getMyInvoices));

// View specific invoice details
router.get('/:id', asyncHandler(getInvoiceById));

// Download PDF
router.get('/:id/download', asyncHandler(downloadInvoice));

export default router;