# API Testing Guide

This guide provides comprehensive instructions for testing the Filon Laundry API, including setup, tools, test cases, and best practices.

## Prerequisites

- Node.js 22.x
- MongoDB running
- Redis running
- API server running on `http://localhost:3000` (or configured port)

## Testing Tools

### 1. Postman
**Recommended for manual testing**

1. Import the Postman collection from `docs/postman_collection.json` (if available)
2. Set up environment variables:
   - `base_url`: `http://localhost:3000/api/v1`
   - `access_token`: (set after login)
   - `refresh_token`: (set after login)

### 2. Thunder Client (VS Code Extension)
**Lightweight alternative to Postman**

1. Install Thunder Client extension
2. Create environment with base URL and auth tokens

### 3. cURL
**Command-line testing**

```bash
# Login example
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

### 4. Newman (Postman CLI)
**Automated testing**

```bash
npm install -g newman
newman run collection.json -e environment.json
```

### 5. Artillery
**Load testing**

```bash
npm install -g artillery
artillery run load-test.yml
```

## Environment Setup

### 1. Start Services
```bash
# Terminal 1: Start MongoDB
mongod

# Terminal 2: Start Redis
redis-server

# Terminal 3: Start API server
npm start
```

### 2. Seed Test Data
```bash
# If available, run seed script
npm run seed
```

### 3. Create Test Users
Use the registration endpoint or directly in MongoDB:

```javascript
// In MongoDB shell
db.users.insertMany([
  {
    fullname: "Super Admin",
    email: "admin@example.com",
    phone_number: "+1234567890",
    password: "$2a$10$...", // hashed password
    role: "super_admin"
  },
  {
    fullname: "Branch Manager",
    email: "manager@example.com",
    phone_number: "+1234567891",
    password: "$2a$10$...",
    role: "branch_manager",
    branchId: ObjectId("...")
  }
]);
```

## Test Cases

### Authentication Tests

#### 1. User Registration
```bash
curl -X POST http://localhost:3000/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Test User",
    "email": "test@example.com",
    "phone_number": "+1234567890",
    "password": "TestPass123!",
    "confirm_password": "TestPass123!"
  }'
```

**Expected**: 201 Created with user data

#### 2. User Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

**Expected**: 200 OK with tokens

#### 3. Access Protected Route
```bash
curl -X GET http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: 200 OK with user list

#### 4. Invalid Token
```bash
curl -X GET http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer invalid_token"
```

**Expected**: 401 Unauthorized

#### 5. Insufficient Permissions
```bash
# Login as customer, try to access admin route
curl -X GET http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer CUSTOMER_TOKEN"
```

**Expected**: 403 Forbidden

### Order Management Tests

#### 1. Create Order
```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "507f1f77bcf86cd799439011",
    "customer_name": "John Doe",
    "customer_phone": "+1234567890",
    "items": [
      {
        "item_type": "Shirt",
        "quantity": 2,
        "unit_price": 5.00
      }
    ]
  }'
```

**Expected**: 201 Created with order data

#### 2. Get Orders
```bash
curl -X GET "http://localhost:3000/api/v1/orders?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: 200 OK with paginated orders

#### 3. Update Order Status
```bash
curl -X PATCH http://localhost:3000/api/v1/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "processing"}'
```

**Expected**: 200 OK

### Input Validation Tests

#### 1. Invalid Email
```bash
curl -X POST http://localhost:3000/api/v1/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Test",
    "email": "invalid-email",
    "phone_number": "+1234567890",
    "password": "TestPass123!"
  }'
```

**Expected**: 400 Bad Request with validation errors

#### 2. Missing Required Fields
```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected**: 400 Bad Request

#### 3. Invalid JSON
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": }'
```

**Expected**: 400 Bad Request with "Invalid JSON" message

### Rate Limiting Tests

#### 1. Exceed Auth Rate Limit
Send multiple login requests rapidly:

```bash
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
```

**Expected**: Last request returns 429 Too Many Requests

### Error Handling Tests

#### 1. Server Error
Try accessing non-existent endpoint:

```bash
curl -X GET http://localhost:3000/api/v1/nonexistent
```

**Expected**: 404 Not Found

#### 2. Database Connection Error
Stop MongoDB and try any endpoint:

**Expected**: 500 Internal Server Error

## Automated Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
Create test files in `test/` directory:

```javascript
// test/auth.test.js
import request from 'supertest';
import app from '../server.js';

describe('Auth Endpoints', () => {
  it('should register a user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/sign-up')
      .send({
        fullname: 'Test User',
        email: 'test@example.com',
        phone_number: '+1234567890',
        password: 'TestPass123!'
      });
    expect(res.status).toBe(201);
  });
});
```

### Load Testing with Artillery

Create `load-test.yml`:

```yaml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
  defaults:
    headers:
      Authorization: 'Bearer YOUR_TOKEN'

scenarios:
  - name: 'Order creation'
    weight: 70
    requests:
      - post:
          url: '/api/v1/orders'
          json:
            branchId: '507f1f77bcf86cd799439011'
            customer_name: 'Load Test'
            items: [{item_type: 'Shirt', quantity: 1, unit_price: 5}]

  - name: 'Get orders'
    weight: 30
    requests:
      - get:
          url: '/api/v1/orders'
```

Run with:
```bash
artillery run load-test.yml
```

## Best Practices

### 1. Test Data Management
- Use separate test database
- Clean up after tests
- Avoid testing with production data

### 2. Authentication in Tests
- Store tokens securely
- Refresh tokens when expired
- Test both authenticated and unauthenticated scenarios

### 3. Error Testing
- Test all error conditions
- Verify error messages are user-friendly
- Check that sensitive data isn't leaked in errors

### 4. Performance Testing
- Test under normal and peak loads
- Monitor response times
- Check memory usage

### 5. Security Testing
- Test for common vulnerabilities (SQL injection, XSS)
- Verify rate limiting works
- Test authorization boundaries

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure server is running on correct port
   - Check firewall settings

2. **Authentication Errors**
   - Verify token format and expiry
   - Check user roles and permissions

3. **Validation Errors**
   - Review request payload format
   - Check required fields

4. **Rate Limiting**
   - Wait for reset period
   - Check rate limit headers in responses

### Debug Mode
Enable debug logging:
```bash
DEBUG=* npm start
```

### Logs
Check logs in `logs/` directory for detailed error information.

## Continuous Integration

Set up CI pipeline to run tests automatically:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '22'
      - run: npm ci
      - run: npm test
      - run: npm run lint
```

This ensures all changes are tested before deployment.