import mongoose from 'mongoose';

const stockLogSchema = new mongoose.Schema({
    inventoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inventory',
        required: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    performed_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    change_type: {
        type: String,
        enum: ['restock', 'usage', 'adjustment', 'loss', 'return'],
        required: true
    },
    quantity_changed: {
        type: Number,
        required: true
    },
    new_stock_level: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        trim: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
    }
}, { timestamps: true });

const StockLog = mongoose.model("StockLog", stockLogSchema);

export default StockLog;