
/**
 * Check if user has one of the specified roles
 * @param {...string} roles - Allowed roles
 * @returns {Function} Middleware function
 */
export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required roles: ${roles.join(', ')}`
            });
        }

        next();
    };
};

/**
 * Check if user owns the resource or is an admin
 * @param {string} ownerField - Field name in request that identifies owner (default: 'userId' or 'customerId')
 * @returns {Function} Middleware function
 */
export const requireOwnerOrAdmin = (ownerField = 'userId') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Admins can access anything
        if (['super_admin', 'branch_manager'].includes(req.user.role)) {
            return next();
        }

        // Check if user is the owner
        const ownerId = req.body?.[ownerField] || req.params?.[ownerField];
        if (ownerId && String(ownerId) === String(req.user.id)) {
            return next();
        }

        res.status(403).json({
            success: false,
            message: 'Access denied'
        });
    };
};

/**
 * Check if user belongs to the same branch (for multi-branch operations)
 * @param {string} branchIdField - Field name containing branch ID (default: 'branchId')
 * @returns {Function} Middleware function
 */
export const requireSameBranch = (branchIdField = 'branchId') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Super admins can access any branch
        if (req.user.role === 'super_admin') {
            return next();
        }

        // Check if user belongs to the target branch
        if (!req.user.branchId) {
            return res.status(403).json({
                success: false,
                message: 'User not assigned to a branch'
            });
        }

        const targetBranchId = req.body?.[branchIdField] || req.params?.[branchIdField] || req.query?.[branchIdField];
        if (targetBranchId && String(targetBranchId) !== String(req.user.branchId)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only access your own branch'
            });
        }

        next();
    };
};
