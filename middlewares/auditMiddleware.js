import { logger } from '../utils/logger.js';

// Log audit information
export const auditLog = (operation_type, description) => {
    return async (req, res, next) => {
        // Store audit info in request for later use
        req.audit = {
            operation_type,
            description,
            timestamp: new Date(),
            userId: req.user?.id,
            user_role: req.user?.role,
            branchId: req.user?.branchId,
            ip: req.ip,
            endpoint: `${req.method} ${req.path}`
        };

        // Capture response for logging
        const originalJson = res.json.bind(res);

        res.json = function (data) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const auditEvent = {
                    ...req.audit,
                    statusCode: res.statusCode,
                    affectedResource: data?.data?._id || data?.data?.orderId,
                    changes: extractChanges(req.body, operation_type),
                };

                logger.info(`[audit] ${operation_type}`, auditEvent);

                // Persist to AuditLog collection
                persistAuditLog(auditEvent).catch((err) => {
                    logger.error("Failed to persist audit log:", err.message);
                });
            }

            return originalJson(data);
        };

        next();
    };
};

// Extract relevant fields for audit logging based on operation type
const extractChanges = (body, operation_type) => {
    const relevantFields = {
        'payment-status-update': ['payment_status', 'total_amount'],
        'order-status-update': ['status', 'payment_status'],
        'revenue-adjustment': ['total_amount', 'discount'],
        'order-delete': ['id', 'status', 'total_amount'],
    };

    const fields = relevantFields[operation_type] || Object.keys(body || {});
    const changes = {};

    fields.forEach(field => {
        if (body && body[field] !== undefined) {
            changes[field] = body[field];
        }
    });

    return changes;
};

// Persist audit log to database
const persistAuditLog = async (auditEvent) => {
    try {
        // Uncomment when model is created
        // const AuditLog = require('../models/auditLog.model.js').default;
        // await AuditLog.create(auditEvent);
    } catch (error) {
        logger.error('Error persisting audit log:', error.message);
    }
};

// Utility function to compare befoere and after data for changes
export const logDataChange = (before, after, fields) => {
    const changes = {};

    fields.forEach(field => {
        if (before[field] !== after[field]) {
            changes[field] = {
                from: before[field],
                to: after[field]
            };
        }
    });

    return Object.keys(changes).length > 0 ? changes : null;
}
