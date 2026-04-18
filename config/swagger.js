import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Filon Laundry Management API',
            version: '1.0.0',
            description: 'Enterprise laundry management system with notifications, analytics, and inventory tracking',
            contact: {
                name: 'API Support',
                email: 'support@filonlaundry.com'
            },
            license: {
                name: 'ISC'
            }
        },
        servers: [
            {
                url: 'http://localhost:3000/api/v1',
                description: 'Development server'
            },
            {
                url: 'https://klean-app.vercel.app/api/v1',
                description: 'Production server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT access token'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        errors: { type: 'array', items: { type: 'string' } }
                    }
                },
                User: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        fullname: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        role: { type: 'string', enum: ['super_admin', 'branch_manager', 'staff', 'customer'] },
                        avatar: { type: 'string' },
                        is_active: { type: 'boolean' },
                        created_at: { type: 'string', format: 'date-time' }
                    }
                },
                Order: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        order_number: { type: 'string' },
                        customerId: { type: 'string' },
                        branchId: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'processing', 'washing', 'drying', 'ironing', 'ready', 'delivered', 'cancelled'] },
                        payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
                        total_amount: { type: 'number' },
                        created_at: { type: 'string', format: 'date-time' }
                    }
                },
                Notification: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        userId: { type: 'string' },
                        type: { type: 'string', enum: ['email', 'sms', 'in_app'] },
                        category: { type: 'string' },
                        subject: { type: 'string' },
                        message: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'sent', 'failed'] },
                        is_read: { type: 'boolean' },
                        sent_at: { type: 'string', format: 'date-time' }
                    }
                },
                Branch: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        address: {
                            type: 'object',
                            properties: {
                                street: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                zip: { type: 'string' }
                            }
                        },
                        email: { type: 'string', format: 'email' },
                        contact_number: { type: 'string' },
                        manager: { type: 'string' },
                        is_active: { type: 'boolean' },
                        operating_hours: { type: 'string' },
                        total_orders: { type: 'number' },
                        total_revenue: { type: 'number' },
                        branch_code: { type: 'string' },
                        services_offered: { type: 'array', items: { type: 'string' } }
                    }
                },
                Employee: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        userId: { type: 'string' },
                        date_of_birth: { type: 'string', format: 'date' },
                        gender: { type: 'string', enum: ['male', 'female'] },
                        phone_number: { type: 'string' },
                        address: { type: 'string' },
                        city: { type: 'string' },
                        state: { type: 'string' },
                        zip: { type: 'string' },
                        country: { type: 'string' },
                        employee_number: { type: 'string' },
                        designation: { type: 'string', enum: ['branch_manager', 'supervisor', 'washer', 'ironer', 'driver', 'receptionist', 'cleaner'] },
                        department: { type: 'string' },
                        branchId: { type: 'string' },
                        join_date: { type: 'string', format: 'date' },
                        status: { type: 'string', enum: ['active', 'inactive', 'on_leave', 'terminated', 'suspended'] },
                        avatar: { type: 'string' },
                        assigned_tasks: { type: 'number' },
                        completed_tasks: { type: 'number' },
                        performance_rating: { type: 'number' },
                    }
                },
                Inventory: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        branchId: { type: 'string' },
                        item_name: { type: 'string' },
                        category: { type: 'string', enum: ['detergent', 'softener', 'stain_removal', 'packaging', 'hangers', 'equipments', 'chemicals', 'other'] },
                        sku: { type: 'string' },
                        current_stock: { type: 'number' },
                        unit: { type: 'string', enum: ['kg', 'liters', 'pieces', 'boxes', 'rolls'] },
                        cost_per_unit: { type: 'number' },
                        reorder_level: { type: 'number' },
                        suplier: { type: 'string' },
                        last_restocked: { type: 'string', format: 'date-time' },
                        reorder_pending: { type: 'boolean' },
                        is_active: { type: 'boolean' }
                    }
                },
                Invoice: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        invoice_number: { type: 'string' },
                        orderId: { type: 'string' },
                        customerId: { type: 'string' },
                        branchId: { type: 'string' },
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    description: { type: 'string' },
                                    quantity: { type: 'number' },
                                    unit_price: { type: 'number' },
                                    total: { type: 'number' }
                                }
                            }
                        },
                        subtotal: { type: 'number' },
                        tax: { type: 'number' },
                        discount: { type: 'number' },
                        total_amount: { type: 'number' },
                        payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid', 'void'] },
                        payment_method: { type: 'string', enum: ['cash', 'card', 'pos', 'wallet'] },
                        due_date: { type: 'string', format: 'date' },
                        paid_date: { type: 'string', format: 'date' },
                        notes: { type: 'string' }
                    }
                }
            }
        },
        security: [{ bearerAuth: [] }]
    },
    apis: [
        './routes/auth.routes.js',
        './routes/user.routes.js',
        './routes/order.routes.js',
        './routes/inventory.routes.js',
        './routes/notification.routes.js',
        './routes/analytics.routes.js',
        './routes/branch.routes.js',
        './routes/branchManager.routes.js',
        './routes/employee.routes.js',
        './routes/invoice.routes.js'
    ]
};

export const specs = swaggerJsdoc(options);
