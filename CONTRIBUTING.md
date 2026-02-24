# Contributing to NetOrch

Thank you for your interest in contributing to NetOrch! This document provides guidelines and instructions for contributing.

## Development Setup

See [docs/guides/development-setup.md](docs/guides/development-setup.md) for detailed environment setup.

### Quick Start

```bash
./dev.sh start     # launch backend (:8000) + frontend (:5173)
./dev.sh stop      # kill both
```

### Prerequisites

- **macOS / Linux** development machine
- **Python 3.11+** with pip
- **Node.js 22+** with npm
- **RHEL VM** with FRRouting + Open vSwitch (or use mock mode: `FRR_ENABLED=false`)

## Project Structure

```
backend/         Python FastAPI backend
  app/
    api/         REST API endpoints
    core/        Configuration, security, validators
    services/    Business logic (FRR, OVS, SSH, topology)
    schemas/     Pydantic request/response schemas
  tests/         pytest test suite
frontend/        React TypeScript frontend
  src/
    api/         API client & endpoints
    components/  Shared UI components
    features/    Feature pages (dashboard, topology, routing, etc.)
    hooks/       Custom React hooks
    stores/      Zustand state stores
docs/            MkDocs documentation
scripts/         VM setup & utility scripts
```

## Code Style

### Backend (Python)
- Follow PEP 8
- Use type hints on all functions
- Use `async/await` for all I/O operations
- Validate all user input before SSH command interpolation (use `app.core.validators`)
- Add docstrings to all public functions

### Frontend (TypeScript/React)
- Functional components with hooks
- Use TypeScript strict mode
- Tailwind CSS for styling
- React Query for server state

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write tests for new functionality
- Update documentation if needed
- Run tests before committing

### 3. Run Tests

**Backend:**
```bash
cd backend
python -m pytest tests/ -x -q
```

**Frontend:**
```bash
cd frontend
npx tsc --noEmit        # type check
npm run build            # build check
```

### 4. Commit

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add VRF BGP configuration endpoint
fix: prevent command injection in routing API
perf: add SSH ControlMaster connection pooling
docs: update architecture overview diagram
test: add VRF endpoint tests
refactor: extract shared validators module
```

### 5. Submit a Pull Request

- Describe what changed and why
- Reference any related issues
- Ensure CI passes

## Security

If you find a security vulnerability, please **do not** open a public issue. Instead, report it privately to the maintainers.

### Input Validation

All user-supplied values that flow into SSH commands **must** be validated through `app.core.validators` before use. This prevents command injection attacks.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
