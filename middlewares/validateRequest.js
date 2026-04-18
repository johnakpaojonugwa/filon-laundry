import { body, query, validationResult } from 'express-validator';

// Helper middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array()
        });
    }
    next();
};

// Validation middleware for order creation
export const validateOrderCreation = [
    body('customerId')
        .isMongoId()
        .withMessage('Valid customer ID (MongoDB ObjectId) is required'),
    body('branchId')
        .isMongoId()
        .withMessage('Valid branch ID (MongoDB ObjectId) is required'),
    body('items')
        .isArray({ min: 1 })
        .withMessage('At least one item is required'),
    body('items.*.service_name')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Service name is required for each item'),
    body('items.*.quantity')
        .isInt({ min: 1 })
        .withMessage('Quantity must be a positive integer'),
    body('items.*.unit_price')
        .isFloat({ min: 0 })
        .withMessage('Unit price must be a non-negative number'),
    body('due_date')
        .optional()
        .isISO8601()
        .withMessage('Due date must be a valid ISO date')
        .custom((value) => {
            if (new Date(value) < new Date()) {
                throw new Error('Due date cannot be in the past');
            }
            return true;
        }),
    // Sanitize and normalize
    body('customer_name').optional().trim().escape(),
    body('customer_phone').optional().trim().escape(),
    body('special_instructions').optional().trim().escape(),
];

// Validation middleware for inventory item creation and updates
export const validateInventoryItem = [
    body('branchId')
        .isMongoId()
        .withMessage('Valid branch ID is required'),
    body('item_name')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Item name is required'),
    body('category')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Category is required'),
    body('current_stock')
        .isInt({ min: 0 })
        .withMessage('Current stock must be a non-negative integer'),
    body('unit')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Unit is required (e.g., kg, liters, pieces)'),
    body('reorder_level')
        .isInt({ min: 0 })
        .withMessage('Reorder level must be a non-negative integer'),
    body('supplier')
        .optional()
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('If supplier is provided, it cannot be empty'),
    body('cost_per_unit')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Cost per unit must be non-negative'),
    // Custom validation for stock vs reorder
    body('current_stock')
        .custom((value, { req }) => {
            if (value < req.body.reorder_level) {
                throw new Error('Warning: Current stock is below reorder level');
            }
            return true;
        }),
];

// Validation middleware for stock adjustments
export const validateStockAdjustment = [
    body('amount')
        .isInt({ ne: 0 })
        .withMessage('Amount must be a non-zero integer'),
    body('change_type')
        .isIn(['restock', 'usage', 'adjustment', 'damage', 'lost'])
        .withMessage('Change type must be one of: restock, usage, adjustment, damage, lost'),
    body('reason')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Reason for adjustment is required'),
];

// Validation middleware for branch creation
export const validateBranchCreation = [
    body('name')
        .trim()
        .escape()
        .isLength({ min: 2 })
        .withMessage('Branch name must be at least 2 characters'),
    body('address.street')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Street address is required'),
    body('address.city')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('City is required'),
    body('address.state')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('State is required'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('contact_number')
        .isMobilePhone()
        .withMessage('Valid phone number is required'),
    body('services_offered')
        .isArray({ min: 1 })
        .withMessage('At least one service must be offered'),
    body('services_offered.*')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Each service must be a non-empty string'),
];

// Validation middleware for branch updates (allows partial updates)
export const validateBranchUpdate = [
    body('name')
        .optional()
        .trim()
        .escape()
        .isLength({ min: 2 })
        .withMessage('Branch name must be at least 2 characters'),
    body('address.street')
        .optional()
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Street address is required if updating address'),
    body('address.city')
        .optional()
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('City is required if updating address'),
    body('address.state')
        .optional()
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('State is required if updating address'),
    body('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('contact_number')
        .optional()
        .isMobilePhone()
        .withMessage('Valid phone number is required'),
    body('services_offered')
        .optional()
        .isArray({ min: 1 })
        .withMessage('At least one service must be offered'),
    body('services_offered.*')
        .optional()
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Each service must be a non-empty string'),
];

// Validation middleware for pagination query parameters
export const validatePaginationParams = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
];
