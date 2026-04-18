import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    operation_type: {
        type: String,
        required: true,
        index: true
    },
    description: {
        type: String,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    user_role: {
        type: String,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        index: true
    },
    ip: {
        type: String,
    },
    affected_resource: {
        type: String,
        index: true
    },
    changes: {
        type: mongoose.Schema.Types.Mixed,
    }, 
    created_at: {
        type: Date,
        default: Date.now,
        index: true,
        expires: 7776000
    }
}, { timestamps: true });

auditLogSchema.index({ userId: 1, created_at: -1 });
auditLogSchema.index({ operation_type: 1, created_at: -1 });
auditLogSchema.index({ branchId: 1, created_at: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;