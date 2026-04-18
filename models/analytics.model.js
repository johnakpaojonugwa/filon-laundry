import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        default: null
    },
    // Orders metrics
    total_orders: {
        type: Number,
        default: 0
    },
    total_order_value: {
        type: Number,
        default: 0
    },
    average_order_value: {
        type: Number,
        default: 0
    },
    orders_completed: {
        type: Number,
        default: 0
    },
    orders_cancelled: {
        type: Number,
        default: 0
    },

    // Order status breakdown
    order_by_status: {
        pending: {
            type: Number,
            default: 0
        },
        processing: {
            type: Number,
            default: 0
        },
        washing: {
            type: Number,
            default: 0
        },
        drying: {
            type: Number,
            default: 0
        },
        ironing: {
            type: Number,
            default: 0
        },
        ready: {
            type: Number,
            default: 0
        },
        delivered: {
            type: Number,
            default: 0
        },
        cancelled: {
            type: Number,
            default: 0
        }
    },

    // Payment metrics
    total_revenue: {
        type: Number,
        default: 0
    },
    paid_orders: {
        type: Number,
        default: 0
    },
    unpaid_orders: {
        type: Number,
        default: 0
    },
    partially_paid_orders: {
        type: Number,
        default: 0
    },
    average_payment_time: {
        type: Number,
        default: 0
    },

    // Customer metrics
    new_customers: {
        type: Number,
        default: 0
    },
    returning_customers: {
        type: Number,
        default: 0
    },
    total_active_customers: {
        type: Number,
        default: 0
    },

    // Staff metrics
    active_staff: {
        type: Number,
        default: 0
    },
    orders_processed_by_staff: {
        type: Number,
        default: 0
    },
    average_processing_time: {
        type: Number,
        default: 0
    },

    // Inventory metrics
    low_stock_alerts: {
        type: Number,
        default: 0
    },
    items_out_of_stock: {
        type: Number,
        default: 0
    },
    inventory_value: {
        type: Number,
        default: 0
    },

    // customer feedback metrics
    average_rating: {
        type: Number,
        default: 0
    },
    total_reviews: {
        type: Number,
        default: 0
    },

    // Peak hours
    peak_order_hours: String,

    notes: String

}, { timestamps: true });

// Indexes for faster querying
analyticsSchema.index({ date: 1, branchId: 1 }, { unique: true });
analyticsSchema.index({ date: -1 });
analyticsSchema.index({ branchId: 1, date: -1 });
analyticsSchema.index({ date: 1}, { expired_after_seconds: 7776000 });

const Analytics = mongoose.model('Analytics', analyticsSchema);
export default Analytics;