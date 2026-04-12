---
name: agent-ut
description: Test framework for opencode Agent behaviors. Use when you need to test skills, agents, or other agent modules through recorded input sequences and assertion verification.
---

# Agent UT

A test framework for opencode Agent behaviors. Record user inputs, replay them, and verify expected behaviors.

## Installation

```bash
npm install -g agentut
```

## Quick Start

### 1. Initialize a Test Directory

```bash
agentut init ./tests --with-example
```

This creates:
- `fixtures/example-env/` - Sample test environment
- `tests/example-test.yaml` - Example test case

### 2. Run Tests

```bash
agentut run ./tests/example-test.yaml
```

### 3. Generate Test from Session

```bash
agentut suggest --latest -o ./tests/my-test.yaml
```

## Test Case Format

Test cases are defined in YAML:

```yaml
name: my-test-suite
description: Test description

environments:
  default:
    directory: ./fixtures/test-env
    setup:
      - copy: ./templates/base
      - run: npm install

scenarios:
  - name: create-file
    environment: default
    cleanup: true
    steps:
      - input: "Create hello.txt"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
        timeout: 60000

config:
  default_timeout: 120000
```

## Assertions

| Assertion | Description |
|-----------|-------------|
| `should_call_tool: ToolName` | Verify a specific tool was called |
| `should_produce_file: filename` | Verify a file was created |
| `file_content_contains: { file, text }` | Verify file content contains text |
| `response_contains: text` | Verify response contains text |

## Commands

### agentut init

Initialize test directory structure.

```bash
agentut init [directory] [--with-example]
```

### agentut suggest

Generate test case from opencode session.

```bash
agentut suggest [sessionId] [--latest] [-o file] [--skill name] [--name name]
```

### agentut run

Run test cases.

```bash
agentut run <testFile> [-f format] [-o file] [-s scenario] [--verbose]
```

### agentut report

Generate formatted report.

```bash
agentut report -i <jsonFile> -f <format> [-o file]
```

## Output Formats

- `json` - Structured JSON (default)
- `markdown` - Human-readable markdown
- `html` - Styled HTML report
- `jest` - Jest-compatible format for CI integration

## CI Integration

For CI/CD pipelines, use JSON or Jest format:

```bash
agentut run ./tests/ -f jest -o results.json
```

Exit code is 0 if all tests pass, 1 if any fail.