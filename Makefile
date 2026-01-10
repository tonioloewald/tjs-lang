# TJS / Agent-99 Makefile

.PHONY: test test-fast test-llm bench docs clean build

# Default target
all: test

# Run all tests (including LLM tests if available)
test:
	bun test

# Run tests without LLM (fast)
test-fast:
	SKIP_LLM_TESTS=1 bun test

# Run only LLM integration tests
test-llm:
	bun test src/batteries/models.integration.test.ts

# Run benchmarks and update benchmarks.md
bench:
	bun bin/benchmarks.ts

# Generate documentation
docs: bench
	@echo "Documentation updated"

# Build CLI tools
build:
	bun build src/cli/tjs.ts --outfile=dist/tjs --target=bun
	bun build src/cli/tjsx.ts --outfile=dist/tjsx --target=bun

# Build compiled binaries (faster cold start)
build-bin:
	bun build src/cli/tjs.ts --compile --outfile=dist/tjs-bin
	bun build src/cli/tjsx.ts --compile --outfile=dist/tjsx-bin

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf node_modules/.cache

# Type check
check:
	bun tsc --noEmit

# Lint
lint:
	bun eslint src/ demo/ editors/

# Format
fmt:
	bun prettier --write src/ demo/ editors/

# Run playground dev server
playground:
	cd demo && bun run dev

# Help
help:
	@echo "Available targets:"
	@echo "  test       - Run all tests"
	@echo "  test-fast  - Run tests without LLM"
	@echo "  bench      - Run benchmarks, update benchmarks.md"
	@echo "  docs       - Generate documentation"
	@echo "  build      - Build CLI tools"
	@echo "  build-bin  - Build compiled binaries"
	@echo "  clean      - Clean build artifacts"
	@echo "  check      - Type check"
	@echo "  lint       - Run linter"
	@echo "  fmt        - Format code"
	@echo "  playground - Run playground dev server"
