import Invoice from "../models/invoice.model.js";
import Order from "../models/order.model.js";
import Branch from "../models/branch.model.js"; 
import { generateInvoicePDF } from "../utils/pdfGenerator.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";

// Generate Unique Invoice Number (Format: INV-YYYY-XXXXX-XXX)
const generateInvoiceNumber = async () => {
    const date = new Date().getFullYear();
    const count = await Invoice.countDocuments({ 
        created_at: { 
            $gte: new Date(`${date}-01-01`), 
            $lte: new Date(`${date}-12-31`) 
        } 
    });

    const uniqueSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `INV-${date}-${(count + 1).toString().padStart(5, '0')}-${uniqueSuffix}`;
};

// Create Invoice
export const createInvoice = async (req, res, next) => {
    try {
        const { orderId, payment_method, notes, tax = 0 } = req.body;
        
        const order = await Order.findById(orderId).populate('items.serviceId');
        if (!order) return sendError(res, 404, "Order not found");

        // Check if invoice already exists for this order to prevent duplicates
        const existingInvoice = await Invoice.findOne({ orderId: order._id });
        if (existingInvoice) {
            return sendResponse(res, 200, true, "Invoice already exists", existingInvoice);
        }

        const invoice_number = await generateInvoiceNumber();

        // Calculate Financials
        const subtotal = order.total_amount;
        const tax_amount = subtotal * (tax / 100);
        const final_total = subtotal + tax_amount;

        const invoice = await Invoice.create({
            invoice_number,
            orderId: order._id,
            customerId: order.customerId,
            branchId: order.branchId,
            items: order.items.map(item => ({
                description: item.service_name || "Laundry Service",
                quantity: item.quantity,
                unitPrice: item.price,
                total: item.quantity * item.price
            })),
            subtotal,
            tax_amount,
            total_amount: final_total,
            payment_status: order.payment_status,
            payment_method: payment_method || "cash",
            notes: notes || ""
        });

        logger.info(`Invoice Created: ${invoice_number} for Order: ${orderId}`);
        return sendResponse(res, 201, true, "Invoice generated successfully", invoice);
    } catch (error) {
        logger.error(`Invoice Creation Error: ${error.message}`);
        next(error);
    }
};

// Get Single Invoice (With Permission Check)
export const getInvoiceById = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customerId', 'fullname email phone')
            .populate('branchId', 'name address phone branchCode');
            
        if (!invoice) return sendError(res, 404, "Invoice not found");

        // Security: Prevent customers from seeing other people's invoices
        if (req.user.role === 'customer' && invoice.customerId?._id.toString() !== req.user.id) {
            return sendError(res, 403, "Access denied: This is not your invoice.");
        }

        return sendResponse(res, 200, true, "Invoice details retrieved", invoice);
    } catch (error) {
        next(error);
    }
};

// List Invoices (Scoped to User/Branch)
export const getMyInvoices = async (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        
        const query = {};
        if (req.user.role === 'customer') {
            query.customerId = req.user.id;
        } else if (req.user.role === 'branch_manager' || req.user.role === 'staff') {
            query.branchId = req.user.branchId;
        }

        const invoices = await Invoice.find(query)
            .sort({ created_at: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean(); // Optimize read-only query

        const total = await Invoice.countDocuments(query);

        return sendResponse(res, 200, true, "Invoices retrieved", {
            invoices,
            pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        next(error);
    }
};

// Download PDF
export const downloadInvoice = async (req, res, next) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return sendError(res, 404, "Invoice not found");

        const branch = await Branch.findById(invoice.branchId);
        if (!branch) return sendError(res, 404, "Branch data missing for this invoice");

        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoice_number}.pdf`);

        // Generate the PDF stream
        const doc = generateInvoicePDF(invoice, branch);

        // Error handling for the PDF stream
        doc.on('error', (err) => {
            logger.error(`PDF Generation Error: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).send("Could not generate PDF");
            }
        });

        // Pipe directly to response
        doc.pipe(res);
        
        // Ensure the doc is finalized
        doc.end(); 
    } catch (error) {
        logger.error(`Download Error: ${error.message}`);
        next(error);
    }
};