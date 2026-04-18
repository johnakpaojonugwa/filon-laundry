import { body, validationResult } from 'express-validator';

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

// Validation middleware for user registration
export const validateRegister = [
    body('fullname')
        .trim()
        .escape()
        .isLength({ min: 3 })
        .withMessage('Full name must be at least 3 characters'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('phone_number')
        .trim()
        .escape()
        .isLength({ min: 10 })
        .withMessage('Valid phone number is required'),
    body('password')
        .isStrongPassword({
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 1
        })
        .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
    body('confirm_password')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password confirmation does not match password');
            }
            return true;
        }),
];

// Validation middleware for login
export const validateLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
];

// Validation middleware for order creation
export const validateCreateOrder = [
    body('branchId')
        .isMongoId()
        .withMessage('Valid branch ID is required'),
    body('customerId')
        .optional()
        .isMongoId()
        .withMessage('Valid customer ID required if provided'),
    body('customer_name')
        .if(body('customerId').not().exists())
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Customer name is required if no customer ID'),
    body('customer_phone')
        .if(body('customerId').not().exists())
        .trim()
        .escape()
        .isLength({ min: 10 })
        .withMessage('Customer phone is required if no customer ID'),
    body('items')
        .isArray({ min: 1 })
        .withMessage('At least one item is required'),
    body('items.*.item_type')
        .trim()
        .escape()
        .isLength({ min: 1 })
        .withMessage('Item type is required for each item'),
    body('items.*.quantity')
        .isInt({ min: 1 })
        .withMessage('Quantity must be at least 1'),
    body('items.*.unit_price')
        .isFloat({ min: 0 })
        .withMessage('Unit price is required and cannot be negative'),
    body('priority')
        .optional()
        .isIn(['normal', 'express', 'urgent'])
        .withMessage('Priority must be normal, express, or urgent'),
    body('status')
        .optional()
        .isIn(['pending', 'processing', 'washing', 'drying', 'ironing', 'ready', 'delivered', 'cancelled'])
        .withMessage('Invalid status'),
];
