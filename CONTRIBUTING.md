# Contributing Guide

## Code Style

- **Go**: Follow [Effective Go](https://golang.org/doc/effective_go)
- **TypeScript/React**: Use ESLint and Prettier
- **Database**: Use migrations for schema changes

## Project Structure

```
helpdesk-ai/
├── cmd/              # Executable entry points
├── internal/         # Private application code
├── frontend/         # Next.js frontend
├── migrations/       # Database migrations
├── docker/          # Docker configurations
└── deployments/     # Kubernetes manifests
```

## Development Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes with tests**
   ```bash
   # Write tests first
   go test ./...
   npm test (for frontend)
   ```

3. **Run linters**
   ```bash
   go fmt ./...
   go vet ./...
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: add ticket assignment feature"
   ```

5. **Push and create pull request**

## Testing

### Backend Tests
```bash
go test -v -cover ./...
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Integration Tests
```bash
go test -tags=integration -v ./...
```

## Git Commit Convention

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style
- `refactor:` Code refactoring
- `perf:` Performance improvement
- `test:` Test addition/modification
- `chore:` Build, dependencies, etc.

## Pull Request Process

1. Update documentation
2. Add/update tests
3. Follow code style
4. Request review from maintainers
5. Address review comments
6. Squash commits if needed

---

Thank you for contributing!
