import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
    },
    item_name: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        enum: ['detergent', 'softener', 'stain_removal', 'packaging', 'hangers', 'equipments', 'chemicals', 'other'],
        default: 'other'
    },
    sku: {
        type: String,
        unique: true,
        description: 'stock keeping unit'
    },
    current_stock: {
        type: Number,
        default: 0,
        min: 0
    },
    unit: {
        type: String,
        enum: ['liters', 'kg', 'pieces', 'boxes', 'rolls', 'other'],
        default: 'kg'
    },
    cost_per_unit: {
        type: Number,
        default: 0,
    },
    reorder_level: {
        type: Number,
        default: 10,
        min: 0
    },
    supplier: {
        type: String,
    },
    last_restocked: {
        type: Date,
    },
    reorder_pending: {
        type: Boolean,
        default: false
    },
    is_active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Indexes for faster queries
inventorySchema.index({ branchId: 1, item_name: 1 }, { unique: true });
inventorySchema.index({ reorder_pending: 1 });
inventorySchema.index({ is_active: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;