import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['email', 'sms', 'in_app'],
        required: true,
    },
    category: {
        type: String,
        enum: ['low_stock', 'order_update', 'payment', 'welcome', 'alert', 'reminder'],
        required: true,
    },
    subject: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    recipient: String,
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'read'],
        default: 'pending'
    },
    sent_at: Date,
    read_at: Date,
    is_read: {
        type: Boolean,
        default: false
    },
    related_orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
    },
    error: String
}, { timestamps: true });   

// Indexes for faster queries
notificationSchema.index({ userId: 1, status: 1 });
notificationSchema.index({ created_at: -1 });
notificationSchema.index({ category: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;


