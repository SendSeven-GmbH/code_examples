# Contributing to SendSeven Examples

Thank you for your interest in contributing to the SendSeven API examples! This document provides guidelines for contributing.

## How to Contribute

### Reporting Issues

If you find a bug or have a suggestion:

1. Check if the issue already exists in [GitHub Issues](https://github.com/SendSeven-GmbH/examples/issues)
2. If not, create a new issue with:
   - Clear title describing the problem
   - Which example and language is affected
   - Steps to reproduce (if applicable)
   - Expected vs actual behavior

### Submitting Changes

1. **Fork** the repository
2. **Create a branch** for your changes:
   ```bash
   git checkout -b fix/python-webhook-signature
   ```
3. **Make your changes** following our code standards (below)
4. **Test your changes** against the API
5. **Commit** with a clear message:
   ```bash
   git commit -m "Fix: Python webhook signature verification timing attack"
   ```
6. **Push** to your fork and create a **Pull Request**

## Code Standards

### General Guidelines

- **Keep it simple**: Examples should be easy to understand
- **Use standard libraries**: Minimize external dependencies
- **Add comments**: Explain non-obvious code, but don't over-comment
- **Handle errors**: Show proper error handling patterns
- **Never hardcode secrets**: Always use environment variables

### Language-Specific Standards

#### Python
- Use Python 3.8+ syntax
- Follow PEP 8 style guide
- Use type hints where helpful
- Use `requests` for HTTP, `flask` for servers

#### JavaScript / TypeScript
- Use ES6+ syntax (async/await, destructuring)
- Use `const` by default, `let` when needed
- TypeScript: Include proper type definitions
- Use Express for servers

#### PHP
- Use PHP 7.4+ syntax
- Use native cURL (no external HTTP libraries)
- Follow PSR-12 coding style

#### Go
- Use Go 1.20+ syntax
- Follow effective Go guidelines
- Use standard library only

#### Java
- Use Java 11+ syntax
- Use `java.net.http.HttpClient` (not Apache HttpClient)
- Use Spring Boot for web examples

#### C#
- Use C# 10+ / .NET 6+ syntax
- Use `HttpClient` with `System.Text.Json`
- Use ASP.NET Core for web examples

#### Ruby
- Use Ruby 3.0+ syntax
- Use standard library (`net/http`, `json`)
- Use Sinatra for web examples

### File Structure

Each language implementation should include:

```
example-name/
└── language/
    ├── main_file.ext      # Main code file
    ├── dependency_file    # requirements.txt, package.json, etc.
    └── .env.example       # Example environment variables
```

### Commit Messages

Use clear, descriptive commit messages:

- `Fix: Description of bug fix`
- `Add: New feature or example`
- `Update: Improvement to existing code`
- `Docs: Documentation changes`

## Testing

Before submitting:

1. **Test against staging API** if you have access
2. **Verify all environment variables** are documented
3. **Check error handling** works correctly
4. **Run on a clean environment** to verify dependencies

## Questions?

- Open a [GitHub Discussion](https://github.com/SendSeven-GmbH/examples/discussions)
- Email: developers@sendseven.com

## Code of Conduct

Be respectful and constructive. We're all here to help developers integrate with SendSeven successfully.

---

Thank you for contributing!
