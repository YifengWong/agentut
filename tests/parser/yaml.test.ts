import { describe, it, expect } from 'vitest';
import { parseYaml, validateYamlTestSuite, parseAndValidateYaml } from '../../src/parser/yaml.js';
import { ValidationError } from '../../src/types/index.js';
import type { YamlTestSuite, Assertion } from '../../src/types/index.js';

describe('parseYaml', () => {
  it('should parse valid YAML test suite', () => {
    const yaml = `
name: test-suite
description: A test suite
environments:
  default:
    directory: ./fixtures/test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps:
      - input: "test input"
        expected:
          - should_call_tool: Write
        timeout: 60000
config:
  default_timeout: 120000
`;
    const result = parseYaml(yaml);
    expect(result.name).toBe('test-suite');
    expect(result.description).toBe('A test suite');
    expect(result.environments).toHaveProperty('default');
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].steps).toHaveLength(1);
  });

  it('should parse setup actions correctly', () => {
    const yaml = `
name: test-suite
environments:
  env1:
    directory: ./test
    setup:
      - copy: ./templates/base
      - run: npm install
scenarios: []
`;
    const result = parseYaml(yaml);
    expect(result.environments.env1.setup).toHaveLength(2);
    expect(result.environments.env1.setup[0]).toEqual({ copy: './templates/base' });
    expect(result.environments.env1.setup[1]).toEqual({ run: 'npm install' });
  });

  it('should parse multiple scenarios', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps: []
  - name: scenario-2
    environment: default
    cleanup: false
    steps: []
`;
    const result = parseYaml(yaml);
    expect(result.scenarios).toHaveLength(2);
  });

  it('should parse all assertion types', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
          - file_content_contains:
              file: hello.txt
              text: "hello"
          - response_contains: "success"
`;
    const result = parseYaml(yaml);
    const expected = result.scenarios[0].steps[0].expected;
    expect(expected).toHaveLength(4);
  });

  it('should throw on invalid YAML syntax', () => {
    const yaml = `invalid: yaml: : syntax`;
    expect(() => parseYaml(yaml)).toThrow();
  });
});

describe('validateYamlTestSuite', () => {
  it('should pass for valid test suite', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: []
      }]
    };
    expect(() => validateYamlTestSuite(suite)).not.toThrow();
  });

  it('should throw ValidationError for missing name', () => {
    const suite = {
      environments: { default: { directory: './test', setup: [] } },
      scenarios: []
    } as unknown as YamlTestSuite;
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for missing environments', () => {
    const suite = {
      name: 'test',
      scenarios: []
    } as unknown as YamlTestSuite;
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for missing scenarios', () => {
    const suite = {
      name: 'test',
      environments: { default: { directory: './test', setup: [] } }
    } as unknown as YamlTestSuite;
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for scenario referencing non-existent environment', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'non-existent',
        cleanup: true,
        steps: []
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for invalid assertion type', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'test',
          expected: [{ invalid_assertion: 'value' }] as unknown as Assertion
        }]
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should use default timeout when step timeout is missing', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'test',
          expected: []
        }]
      }],
      config: {
        default_timeout: 90000
      }
    };
    validateYamlTestSuite(suite);
    expect(suite.scenarios[0].steps[0].timeout).toBe(90000);
  });

  it('should use 60000 as default timeout when config is missing', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'test',
          expected: []
        }]
      }]
    };
    validateYamlTestSuite(suite);
    expect(suite.scenarios[0].steps[0].timeout).toBe(60000);
  });
});

describe('parseAndValidateYaml', () => {
  it('should parse and validate valid YAML', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected: []
`;
    const result = parseAndValidateYaml(yaml);
    expect(result.name).toBe('test-suite');
    expect(result.scenarios[0].steps[0].timeout).toBe(60000);
  });

  it('should throw for invalid YAML', () => {
    const yaml = `
name: test
environments:
  default:
    directory: ./test
scenarios: []
`;
    expect(() => parseAndValidateYaml(yaml)).toThrow(ValidationError);
  });
});