---
name: agent-vcr
description: Test framework for opencode Agent behaviors. Use when you need to test skills, agents, or other agent modules through recorded input sequences and assertion verification.
---

# Agent VCR

A test framework for opencode Agent behaviors. Record user inputs, replay them, and verify expected behaviors.

## Installation

```bash
npm install -g agentvcr
```

## Quick Start

### 1. Initialize a Test Directory

```bash
agentvcr init ./tests --with-example
```

This creates:
- `fixtures/example-env/` - Sample test environment
- `tests/example-test.yaml` - Example test case

### 2. Run Tests

```bash
agentvcr run ./tests/example-test.yaml
```

### 3. Generate Test from Session

```bash
agentvcr suggest --latest -o ./tests/my-test.yaml
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

### agentvcr init

Initialize test directory structure.

```bash
agentvcr init [directory] [--with-example]
```

### agentvcr suggest

Generate test case from opencode session.

```bash
agentvcr suggest [sessionId] [--latest] [-o file] [--skill name] [--name name]
```

### agentvcr run

Run test cases.

```bash
agentvcr run <testFile> [-f format] [-o file] [-s scenario] [--verbose]
```

### agentvcr report

Generate formatted report.

```bash
agentvcr report -i <jsonFile> -f <format> [-o file]
```

## Output Formats

- `json` - Structured JSON (default)
- `markdown` - Human-readable markdown
- `html` - Styled HTML report
- `jest` - Jest-compatible format for CI integration

## CI Integration

For CI/CD pipelines, use JSON or Jest format:

```bash
agentvcr run ./tests/ -f jest -o results.json
```

Exit code is 0 if all tests pass, 1 if any fail.