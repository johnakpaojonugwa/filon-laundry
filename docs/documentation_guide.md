# Documentation Guide

This guide provides comprehensive instructions for maintaining and updating documentation in the Filon Laundry project. Proper documentation ensures that developers, testers, and stakeholders can effectively understand, use, and contribute to the project.

## Documentation Structure

```
docs/
├── api_reference.md          # Complete API endpoint documentation
├── api_testing_guide.md      # Testing instructions and examples
├── code_review.md           # Code review standards and guidelines
├── documentation_guide.md   # This file - documentation maintenance
├── architecture.md          # System architecture (future)
├── deployment.md            # Deployment instructions (future)
├── troubleshooting.md       # Common issues and solutions (future)
└── CHANGELOG.md             # Version history and changes (future)
```

## Documentation Standards

### 1. File Naming
- Use lowercase with hyphens: `api-reference.md`
- Be descriptive and specific
- Include version numbers if applicable: `api-v2-reference.md`

### 2. Content Organization
- Start with overview/introduction
- Use clear headings and subheadings
- Include table of contents for long documents
- End with related links or references

### 3. Writing Style
- Use clear, concise language
- Write in active voice
- Use consistent terminology
- Include examples and code snippets
- Keep sentences short and direct

### 4. Code Examples
```javascript
// ✅ Good - Include comments and context
// Create a new order
const order = await api.createOrder({
  customer_name: 'John Doe',
  items: [{ item_type: 'Shirt', quantity: 2 }]
});

// ❌ Bad - No context or explanation
const order = await api.createOrder(orderData);
```

### 5. Formatting
- Use Markdown for all documentation
- Include code blocks with language specification
- Use tables for structured data
- Include images/diagrams when helpful

## API Documentation Maintenance

### When to Update API Documentation

#### 1. New Endpoints
- Document immediately when endpoint is created
- Include request/response examples
- Specify authentication requirements
- List required permissions

#### 2. Endpoint Changes
- Update parameters, request/response formats
- Document breaking changes clearly
- Update version information
- Add migration notes if applicable

#### 3. Deprecations
- Mark deprecated endpoints clearly
- Provide sunset timeline
- Suggest replacement endpoints
- Update removal date

### API Documentation Template

```markdown
## Endpoint Name

**Method:** `POST`  
**Path:** `/api/v1/resource`  
**Auth Required:** Yes  
**Permissions:** `resource:create`

### Description
Brief description of what this endpoint does.

### Request Body
```json
{
  "field1": "string (required)",
  "field2": "number (optional)"
}
```

### Response
**Success (201):**
```json
{
  "success": true,
  "data": {
    "id": "resource_id",
    "field1": "value",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": ["field1 is required"]
}
```

### Example Usage
```bash
curl -X POST http://localhost:3000/api/v1/resource \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"field1": "value"}'
```
```

## Code Documentation

### 1. Inline Comments
- Explain complex business logic
- Document assumptions and edge cases
- Comment non-obvious code sections

```javascript
// ✅ Good
// Calculate total with tax, excluding discounts for premium customers
const total = basePrice * (1 + taxRate) - (isPremium ? 0 : discount);

// ❌ Bad
// Calculate total
const total = basePrice * (1 + taxRate) - discount;
```

### 2. Function Documentation
Use JSDoc for all public functions:

```javascript
/**
 * Creates a new laundry order
 * @param {Object} orderData - Order information
 * @param {string} orderData.customer_name - Customer full name
 * @param {Array} orderData.items - Array of order items
 * @returns {Promise<Object>} Created order object
 * @throws {ValidationError} When order data is invalid
 */
async function createOrder(orderData) {
  // Implementation
}
```

### 3. Model Documentation
Document Mongoose schemas:

```javascript
const orderSchema = new mongoose.Schema({
  customer_name: {
    type: String,
    required: true,
    description: 'Full name of the customer placing the order'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled'],
    default: 'pending',
    description: 'Current status of the order'
  }
});
```

## Testing Documentation

### 1. Test Case Documentation
Document test scenarios and expected outcomes:

```javascript
describe('Order Creation', () => {
  it('should create order with valid data', async () => {
    // Test implementation
  });

  it('should reject order with invalid customer data', async () => {
    // Test implementation
  });
});
```

### 2. Test Data Documentation
Document test data setup and cleanup:

```javascript
// Test data setup
const testUser = {
  fullname: 'Test User',
  email: 'test@example.com',
  role: 'customer'
};

// Cleanup after tests
afterEach(async () => {
  await User.deleteMany({ email: /test@/ });
});
```

## Version Control for Documentation

### 1. Commit Messages
Use clear, descriptive commit messages:

```
docs: update API reference for order endpoints
fix: correct parameter types in user registration docs
feat: add testing guide for new authentication flow
```

### 2. Pull Request Documentation
- Reference documentation changes in PR descriptions
- Tag documentation PRs appropriately
- Request review from documentation stakeholders

### 3. Version Tagging
Tag documentation updates with version releases:

```bash
git tag -a v1.2.0 -m "Release v1.2.0 - Add order management API"
```

## Documentation Review Process

### 1. Self-Review Checklist
- [ ] Spelling and grammar checked
- [ ] Links are working
- [ ] Code examples are correct and runnable
- [ ] Screenshots/images are up-to-date
- [ ] Table of contents matches document structure

### 2. Peer Review
- Technical accuracy
- Clarity and readability
- Completeness
- Consistency with existing docs

### 3. Automated Checks
Use tools to validate documentation:

```bash
# Check links
npm install -g markdown-link-check
markdown-link-check docs/*.md

# Check spelling
npm install -g markdown-spellcheck
mdspell docs/*.md
```

## Tools and Automation

### 1. Documentation Generators
- **JSDoc**: Generate API docs from code comments
- **Swagger/OpenAPI**: Generate interactive API documentation
- **MkDocs**: Static site generator for documentation

### 2. Linting and Validation
```json
// .markdownlint.json
{
  "default": true,
  "MD013": false, // Line length
  "MD024": false, // Multiple headers with same content
  "MD033": false  // Inline HTML
}
```

### 3. CI/CD Integration
```yaml
# .github/workflows/docs.yml
name: Documentation
on:
  push:
    paths:
      - 'docs/**'
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check links
        run: npx markdown-link-check docs/*.md
      - name: Check spelling
        run: npx markdown-spellcheck docs/*.md
```

## Maintenance Schedule

### Daily Tasks
- Review and merge documentation PRs
- Update API docs for code changes
- Fix broken links

### Weekly Tasks
- Review documentation analytics
- Update outdated examples
- Check for new documentation needs

### Monthly Tasks
- Comprehensive documentation audit
- Update style guides and templates
- Review and update contribution guidelines

## Contributing to Documentation

### 1. Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b docs/update-api-reference`
3. Make changes following the standards above
4. Submit a pull request

### 2. Contribution Guidelines
- Follow the established templates
- Test all code examples
- Update table of contents
- Add yourself to contributors if significant contribution

### 3. Documentation Issues
Report documentation issues using the standard issue template:

```markdown
## Documentation Issue

**Page:** docs/api_reference.md
**Section:** Authentication Endpoints
**Issue:** Missing example for refresh token endpoint
**Suggested Fix:** Add curl example and response format
```

## Documentation Metrics

Track these metrics to improve documentation quality:

- **Page views** per document
- **Time to find information** (user surveys)
- **Documentation completeness** (feature coverage)
- **User satisfaction** (feedback forms)
- **Update frequency** (how often docs are updated)

## Best Practices

### 1. Keep it Current
- Update documentation with code changes
- Mark outdated sections clearly
- Remove deprecated content promptly

### 2. Make it Accessible
- Use simple language
- Include search functionality
- Provide multiple formats (PDF, HTML)
- Consider different user roles (developer, tester, admin)

### 3. Encourage Feedback
- Include feedback forms
- Monitor documentation issues
- Act on user suggestions
- Regularly survey users

### 4. Automate Where Possible
- Generate API docs from code
- Use templates for consistency
- Automate validation checks
- Integrate with CI/CD pipelines

## Resources

### Documentation Tools
- [Markdown Guide](https://www.markdownguide.org/)
- [JSDoc Documentation](https://jsdoc.app/)
- [Swagger/OpenAPI](https://swagger.io/)
- [MkDocs](https://www.mkdocs.org/)

### Style Guides
- [Google Developer Documentation Style Guide](https://developers.google.com/style)
- [Microsoft Writing Style Guide](https://docs.microsoft.com/en-us/style-guide/welcome/)
- [API Documentation Best Practices](https://idratherbewriting.com/learnapidoc/)

### Community Resources
- [Write the Docs](https://www.writethedocs.org/)
- [Documentation Slack Community](https://documentation.divio.com/)
- [API Documentation Forum](https://forum.api-docs.org/)

Remember: Good documentation is as important as good code. It enables effective collaboration, reduces support burden, and improves the overall developer experience.