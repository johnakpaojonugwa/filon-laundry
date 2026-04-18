# Code Review Guidelines

This document outlines the standards and best practices for conducting code reviews in the Filon Laundry project. Code reviews ensure code quality, maintainability, security, and consistency across the codebase.

## Code Review Process

### 1. When to Request a Review
- All code changes must be reviewed before merging to main/master
- Feature branches should be reviewed before integration
- Hotfixes and critical patches require immediate review

### 2. Review Timeline
- **Response Time**: Reviewers should respond within 24 hours
- **Review Completion**: Complete reviews within 48 hours for standard changes
- **Urgent Changes**: 4-6 hours for critical fixes

### 3. Review Checklist

#### ✅ Code Quality
- [ ] Code follows established patterns and conventions
- [ ] Functions are small and focused (single responsibility)
- [ ] Variables and functions use consistent naming (camelCase for functions, snake_case for variables, camelCase for 'id' variables)
- [ ] No unused variables, imports, or dead code
- [ ] Code is readable and self-documenting
- [ ] Comments explain complex logic, not obvious code

#### ✅ Security
- [ ] Input validation and sanitization implemented
- [ ] Authentication and authorization checks in place
- [ ] Sensitive data (passwords, tokens) not logged or exposed
- [ ] SQL injection and XSS vulnerabilities prevented
- [ ] Rate limiting and abuse prevention considered
- [ ] Dependencies are up-to-date and secure

#### ✅ Performance
- [ ] No N+1 queries or inefficient database operations
- [ ] Appropriate indexing considered for new queries
- [ ] Large data sets handled with pagination
- [ ] Caching implemented where beneficial
- [ ] Memory leaks prevented (timers, event listeners)

#### ✅ Error Handling
- [ ] Proper error handling and logging
- [ ] User-friendly error messages (no sensitive info)
- [ ] Graceful degradation for external service failures
- [ ] Appropriate HTTP status codes returned

#### ✅ Testing
- [ ] Unit tests written for new functions
- [ ] Integration tests for API endpoints
- [ ] Edge cases and error conditions tested
- [ ] Test coverage maintained or improved

#### ✅ Documentation
- [ ] Code changes documented in commit messages
- [ ] API changes documented in API reference
- [ ] Complex logic explained with comments
- [ ] README updated if necessary

## Review Comments

### Comment Types

#### 🔴 Blocking Comments (Must Fix)
- Security vulnerabilities
- Breaking changes without migration
- Major performance issues
- Incorrect business logic

#### 🟡 Suggestions (Should Consider)
- Code style improvements
- Performance optimizations
- Alternative implementations
- Additional test cases

#### 🟢 Nitpicks (Optional)
- Minor style preferences
- Code formatting
- Non-critical improvements

### Comment Format
```
❓ Question: Why did you choose this approach?
💡 Suggestion: Consider using async/await instead of promises
🔧 Fix: This will cause a memory leak
✅ Good: Clean implementation
```

## Reviewer Responsibilities

### 1. Preparation
- Review the pull request description and requirements
- Understand the context and impact of changes
- Run the code locally if needed
- Check for related issues or previous discussions

### 2. Thorough Review
- Read every line of changed code
- Test the functionality
- Check for edge cases
- Verify tests pass and coverage is adequate

### 3. Constructive Feedback
- Be specific and provide examples
- Explain reasoning for suggestions
- Balance criticism with positive feedback
- Focus on code, not the person

### 4. Follow-up
- Respond to author questions promptly
- Re-review after changes are made
- Approve when standards are met

## Author Responsibilities

### 1. Preparation
- Write clear pull request descriptions
- Reference related issues
- Ensure tests pass locally
- Self-review code before requesting review

### 2. During Review
- Respond to all comments
- Explain design decisions when questioned
- Make requested changes promptly
- Ask for clarification if needed

### 3. After Review
- Address all blocking comments
- Consider suggestions seriously
- Update documentation as needed
- Ensure CI/CD passes

## Code Standards

### JavaScript/Node.js Standards

#### Naming Conventions
```javascript
// ✅ Good
function getUserById(userId) {
  const user_name = 'John Doe';
  const branchId = '12345';
  // ...
}

// ❌ Bad
function getuserbyid(userid) {
  const userName = 'John Doe';
  const branch_id = '12345';
  // ...
}
```

#### Function Structure
```javascript
// ✅ Good
async function createOrder(orderData) {
  try {
    // Input validation
    validateOrderData(orderData);

    // Business logic
    const order = await Order.create(orderData);

    // Response
    return order;
  } catch (error) {
    logger.error('Order creation failed', error);
    throw error;
  }
}

// ❌ Bad
async function createOrder(orderData) {
  const order = await Order.create(orderData);
  return order;
}
```

#### Error Handling
```javascript
// ✅ Good
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', { error: error.message, context });
  throw new CustomError('Operation failed', 500);
}

// ❌ Bad
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  throw error; // Loses context
}
```

### Database Standards

#### Query Optimization
```javascript
// ✅ Good
const users = await User.find({ role: 'customer' })
  .select('fullname email')
  .limit(10)
  .lean();

// ❌ Bad
const users = await User.find(); // Fetches all fields
```

#### Schema Design
```javascript
// ✅ Good
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  role: {
    type: String,
    enum: ['customer', 'staff', 'manager', 'admin'],
    default: 'customer'
  }
});

// ❌ Bad
const userSchema = new mongoose.Schema({
  email: String, // No validation
  role: String // No constraints
});
```

### API Standards

#### Response Consistency
```javascript
// ✅ Good
res.status(200).json({
  success: true,
  message: 'Operation successful',
  data: result
});

// ❌ Bad
res.send(result); // Inconsistent format
```

#### Input Validation
```javascript
// ✅ Good
const { body } = require('express-validator');

const validateUser = [
  body('email').isEmail().normalizeEmail(),
  body('password').isStrongPassword(),
  // ...
];

// ❌ Bad
// No validation - vulnerable to attacks
```

## Automated Checks

### Pre-commit Hooks
Use husky and lint-staged for automatic checks:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.js": ["eslint", "npm test"]
  }
}
```

### CI/CD Pipeline
Ensure these checks run automatically:
- ESLint
- Unit tests
- Integration tests
- Security scans
- Code coverage

## Common Issues and Solutions

### 1. Large Pull Requests
**Problem**: Too many changes to review effectively
**Solution**: Break into smaller, focused PRs

### 2. Lack of Tests
**Problem**: Code changes without corresponding tests
**Solution**: Require test coverage for new features

### 3. Inconsistent Code Style
**Problem**: Different coding styles across team
**Solution**: Use ESLint and Prettier configurations

### 4. Missing Documentation
**Problem**: Code changes without documentation updates
**Solution**: Include documentation in PR checklist

### 5. Security Oversights
**Problem**: Security vulnerabilities introduced
**Solution**: Security-focused review checklist and automated scans

## Tools and Resources

### Code Review Tools
- GitHub Pull Requests
- GitLab Merge Requests
- Bitbucket Pull Requests
- CodeStream (IDE integration)

### Code Quality Tools
- ESLint
- Prettier
- SonarQube
- CodeClimate

### Testing Tools
- Jest
- Supertest
- Artillery (load testing)
- OWASP ZAP (security testing)

## Escalation Process

1. **Minor Disagreements**: Discuss and reach consensus
2. **Major Conflicts**: Involve team lead or architect
3. **Stalemates**: Schedule meeting to resolve
4. **Urgent Issues**: Escalate to project manager

## Continuous Improvement

### Review Metrics
Track and improve:
- Time to review
- Number of review cycles
- Bug detection rate
- Code quality scores

### Feedback Loop
- Regular review retrospectives
- Update guidelines based on lessons learned
- Share best practices across team

## Conclusion

Code reviews are a critical part of maintaining high-quality, secure, and maintainable code. Following these guidelines ensures consistent standards and continuous improvement across the development team.

Remember: The goal is better code, not criticism. Approach reviews with a collaborative mindset focused on learning and improvement.