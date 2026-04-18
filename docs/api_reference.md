# API Reference

## Overview

The Filon Laundry API is a RESTful API built with Node.js, Express, and MongoDB for managing laundry services. It provides endpoints for user management, order processing, inventory tracking, and analytics.

**Base URL**: `https://api.filonlaundry.com/api/v1`

**Version**: 1.0.0

## Authentication

All API requests require authentication except for public endpoints (login, register, health check).

### JWT Authentication
- Include the JWT token in the `Authorization` header: `Bearer <token>`
- Tokens expire after 24 hours
- Use refresh tokens to obtain new access tokens

### Roles
- `super_admin`: Full access
- `branch_manager`: Branch-specific management
- `staff`: Order processing and inventory
- `customer`: Order placement and profile management

## Response Format

All responses follow this structure:

```json
{
  "success": true|false,
  "message": "Response message",
  "data": { ... } // or "errors": [...]
}
```

## Endpoints

### Authentication

#### POST /auth/sign-up
Register a new user.

**Auth**: None
**Body**:
```json
{
  "fullname": "string",
  "email": "string",
  "phone_number": "string",
  "password": "string",
  "confirm_password": "string",
  "role": "customer|staff|branch_manager|super_admin" // optional
}
```

**Response**: 201 Created
```json
{
  "success": true,
  "message": "User created successfully",
  "data": { user object }
}
```

#### POST /auth/login
Authenticate user.

**Auth**: None
**Body**:
```json
{
  "email": "string",
  "password": "string"
}
```

**Response**: 200 OK
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { user object },
    "tokens": {
      "access": "jwt_token",
      "refresh": "refresh_token"
    }
  }
}
```

#### POST /auth/refresh-token
Refresh access token.

**Auth**: None
**Body**:
```json
{
  "refreshToken": "string"
}
```

#### POST /auth/logout
Logout user.

**Auth**: Required
**Body** (optional):
```json
{
  "refreshToken": "string"
}
```

### Users

#### GET /users
Get all users (admin/manager only).

**Auth**: Required (super_admin, branch_manager)
**Query**:
- `page`: number (default: 1)
- `limit`: number (default: 10, max: 100)
- `search`: string
- `branchId`: string (ObjectId)

**Response**: 200 OK
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "pagination": { ... },
    "employees": [ user objects ]
  }
}
```

#### POST /users
Create new user.

**Auth**: Required (super_admin, branch_manager)

#### GET /users/customers
Get customers.

**Auth**: Required (super_admin, branch_manager, staff)

#### GET /users/:id
Get user by ID.

**Auth**: Required

#### PUT /users/:id
Update user.

**Auth**: Required (owner or admin)

#### DELETE /users/:id
Delete user.

**Auth**: Required (super_admin)

### Orders

#### POST /orders
Create new order.

**Auth**: Required
**Body**:
```json
{
  "branchId": "ObjectId",
  "customerId": "ObjectId", // optional
  "customer_name": "string", // if no customerId
  "customer_phone": "string", // if no customerId
  "items": [
    {
      "item_type": "string",
      "quantity": "number",
      "unit_price": "number"
    }
  ],
  "priority": "normal|express|urgent",
  "special_instructions": "string"
}
```

#### GET /orders
Get orders.

**Auth**: Required
**Query**: page, limit, status, etc.

#### GET /orders/:id
Get order by ID.

**Auth**: Required

#### PUT /orders/:id
Update order.

**Auth**: Required (admin/staff)

#### PATCH /orders/:id/status
Update order status.

**Auth**: Required (admin/staff/manager)

#### PUT /orders/:id/mark-paid
Mark order as paid.

**Auth**: Required (admin/manager)

### Inventory

#### GET /inventory
Get inventory items.

**Auth**: Required

#### POST /inventory
Add inventory item.

**Auth**: Required (admin/manager)

#### PUT /inventory/:id
Update inventory item.

**Auth**: Required (admin/manager)

#### PATCH /inventory/:id/stock
Adjust stock.

**Auth**: Required (admin/manager)

### Analytics

#### GET /analytics/dashboard
Get dashboard analytics.

**Auth**: Required (admin/manager)

#### GET /analytics/orders
Get order analytics.

**Auth**: Required (admin/manager)

### Branches

#### GET /branches
Get all branches.

**Auth**: Required

#### POST /branches
Create branch.

**Auth**: Required (super_admin)

#### PUT /branches/:id
Update branch.

**Auth**: Required (super_admin)

### Notifications

#### GET /notifications
Get user notifications.

**Auth**: Required

#### PATCH /notifications/:id/read
Mark notification as read.

**Auth**: Required

### Health Check

#### GET /health
Check system health.

**Auth**: None
**Response**:
```json
{
  "success": true,
  "message": "Server is running",
  "services": {
    "database": "connected|disconnected",
    "redis": "connected|disconnected"
  },
  "system": { ... },
  "timestamp": "ISO string"
}
```

## Error Codes

- 400: Bad Request (validation errors)
- 401: Unauthorized (invalid/missing token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 429: Too Many Requests (rate limited)
- 500: Internal Server Error

## Rate Limits

- General: 1000 requests per 15 minutes per IP
- Auth endpoints: 5 requests per 15 minutes per IP
- Refresh token: 3 requests per 15 minutes per IP

## Data Formats

- Dates: ISO 8601 strings
- IDs: MongoDB ObjectId strings (24 hex characters)
- Phone numbers: E.164 format preferred
- Emails: Normalized to lowercase

For detailed Swagger documentation, visit `/api-docs` when the server is running.