import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
    invoice_number: {
        type: String,
        unique: true,
        required: true,
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
    },
    items: [{
        description: String,
        quantity: Number,
        unit_price: Number,
        total: Number
    }],
    subtotal: {
        type: Number,
        required: true,
    },
    tax: {
        type: Number,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    total_amount: {
        type: Number,
        required: true,
    },
    payment_status: {
        type: String,
        enum: ['paid', 'unpaid', 'partial', 'void'],
        default: 'unpaid'
    },
    payment_method: {
        type: String,
        enum: ['cash', 'card', 'pos', 'wallet'],
        default: 'cash'
    },
    due_date: Date,
    paid_date: Date,
    notes: String,
}, { timestamps: true });

// Indexes for faster queries
invoiceSchema.index({ invoice_number: 1 });
invoiceSchema.index({ customerId: 1, createdAt: -1 });
invoiceSchema.index({ branchId: 1, createdAt: -1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;