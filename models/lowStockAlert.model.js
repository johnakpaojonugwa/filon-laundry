import mongoose from 'mongoose';
import Inventory from './inventory.model.js';

const lowStockAlertSchema = new mongoose.Schema({
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
    },
    item_name: {
        type: String,
    },
    current_stock: {
        type: Number,
    },
    reorder_level: {
        type: Number,
    },
    alert_sent_at: {
        type: Date,
    },
    alerts_sent: {
        type: Number,
        default: 1,
    },
    is_resolved: {
        type: Date
    },
    resolved_at: {
        type: Date,
    },
    notificationIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Notification',
    }]
}, { timestamps: true });

// Indexes for faster queries
lowStockAlertSchema.index({ branchId: 1, is_resolved: 1 });
lowStockAlertSchema.index({ alert_sent_at: -1 });

const LowStockAlert = mongoose.model('LowStockAlert', lowStockAlertSchema);

export default LowStockAlert;