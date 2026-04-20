import mongoose from 'mongoose';
import { customAlphabet } from 'nanoid';

// Generate unique order numbers (e.g., ORD-ABC123-XYZ)
const generateShortId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// Order Schema - Defines the structure for laundry orders
const orderSchema = new mongoose.Schema({
    // Unique order identifier with prefix
    order_number: {
        type: String,
        unique: true,
        index: true,
        default: () => `ORD-${generateShortId()}`,
    },

    // Reference to the customer placing the order
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    // Branch where the order is processed
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
    },

    // Employee assigned to handle this order
    assigned_employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },

    // User who created the order
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    // Customer contact information (cached for performance)
    customer_name: {
        type: String,
        required: true,
    },
    customer_phone: {
        type: String,
        required: true,
    },
    
    // Order items with type, quantity, and pricing
    items: [{
        item_type: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        unit_price: {
            type: Number,
            required: true,
        },
        subtotal: {
            type: Number,
            default: 0
        },
        special_instructions: String,
    }],
    service_type: {
        type: String,
        enum: ['wash_fold', 'ironing', 'dry_cleaning', 'stain_removal', 'alterations'],
        default: 'wash_fold',
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'washing', 'drying', 'ironing', 'ready', 'delivered', 'cancelled'],
        default: 'pending'
    },
    status_history: [{
        status: String,
        updated_at: {
            type: Date, 
            default: Date.now
        },
        updated_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    priority: {
        type: String,
        enum: ['normal', 'express', 'urgent'],
        default: 'normal',
    },
    pickup_date: Date,
    delivery_date: Date,
    payment_method: {
        type: String,
        enum: ['cash', 'card', 'pos', 'wallet'],
        default: 'cash',
    },
    payment_status: {
        type: String,
        enum: ['paid', 'unpaid', 'partial', 'void'],
        default: 'unpaid',
    },
    discount: {
        type: Number,
        default: 0,
    },
    tax: {
        type: Number,
        default: 0,
    },
    subtotal: {
        type: Number,
        default: 0,
    },
    total_amount: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

// Indexes for faster queries
orderSchema.index({ branchId: 1, status: 1 });
orderSchema.index({ customerId: 1, created_at: -1 });
orderSchema.index({ branchId: 1, created_at: -1 });
orderSchema.index({ created_at: -1, payment_status: 1 });
orderSchema.index({ payment_status: 1 });
orderSchema.index({ status: 1, created_at: -1 });

// Pre-save: financial calculations
orderSchema.pre('save', function () {
    if (this.isModified('status')) {
        this.status_history.push({
            status: this.status,
            updated_at: new Date(),
            updated_by: this.updated_by || this.created_by
        });
    }

    if (this.isModified('items') || this.isModified('priority') || this.isModified('discount')) {
        let items_total = 0;

        this.items.forEach(item => {
            item.subtotal = (item.quantity || 0 ) * (item.unit_price || 0);
            items_total += item.subtotal;
        });

        this.items_total = items_total;

        const multipliers = { 'urgent': 1.5, 'express': 1.25, 'normal': 1 };
        const multiplier = multipliers[this.priority] || 1;

        this.subtotal = items_total * multiplier;

        // Tax calculation (7.5% tax rate)
        this.tax = Math.round((this.subtotal * 0.075) * 100) / 100;

        const final = this.subtotal + this.tax - (this.discount || 0);
        this.total_amount = Math.max(0, Math.round(final * 100) / 100);
    }
});

const Order = mongoose.model('Order', orderSchema);

export default Order;