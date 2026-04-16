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
      - copy: "./templates/base -> $WORKDIR/"
      - run: npm install
scenarios: []
`;
    const result = parseYaml(yaml);
    expect(result.environments.env1.setup).toHaveLength(2);
    expect(result.environments.env1.setup[0]).toEqual({ copy: './templates/base -> $WORKDIR/' });
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

  it('should throw ValidationError for setup.copy without -> separator', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: {
          directory: './test',
          setup: [
            { copy: './templates/base' }  // 缺少 -> 分隔符
          ]
        }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: []
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should pass for valid setup.copy with -> separator', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: {
          directory: './test',
          setup: [
            { copy: './templates/base -> $WORKDIR/' }
          ]
        }
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
});

describe('agent_cli default value', () => {
  it('should set default agent_cli when not provided', () => {
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
    expect(suite.config?.agent_cli?.runner).toBe('opencode');
    expect(suite.config?.agent_cli?.command).toBe('opencode');
  });

  it('should preserve user-configured agent_cli', () => {
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
        agent_cli: {
          runner: 'opencode',
          command: 'mycode'
        }
      }
    };
    validateYamlTestSuite(suite);
    expect(suite.config?.agent_cli?.command).toBe('mycode');
  });

  it('should set agent_cli default even when other config fields exist', () => {
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
    expect(suite.config?.agent_cli?.runner).toBe('opencode');
    expect(suite.config?.agent_cli?.command).toBe('opencode');
    expect(suite.config?.default_timeout).toBe(90000);
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

describe('runs and min_pass configuration', () => {
  it('should parse global runs and min_pass', () => {
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
config:
  runs: 10
  min_pass: 8
`;
    const result = parseYaml(yaml);
    expect(result.config?.runs).toBe(10);
    expect(result.config?.min_pass).toBe(8);
  });

  it('should parse scenario-level runs and min_pass', () => {
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
    runs: 5
    min_pass: 4
`;
    const result = parseYaml(yaml);
    expect(result.scenarios[0].runs).toBe(5);
    expect(result.scenarios[0].min_pass).toBe(4);
  });

  it('should parse assertion-level min_pass', () => {
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
            min_pass: 9
`;
    const result = parseYaml(yaml);
    const assertion = result.scenarios[0].steps[0].expected[0];
    expect(assertion).toHaveProperty('min_pass', 9);
  });
});

describe('validateYamlTestSuite runs and min_pass defaults', () => {
  it('should set default runs=5 and min_pass=4 when not provided', () => {
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
    expect(suite.config?.runs).toBe(5);
    expect(suite.config?.min_pass).toBe(4);
  });

  it('should preserve user-configured runs and min_pass', () => {
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
      }],
      config: {
        runs: 10,
        min_pass: 8
      }
    };
    validateYamlTestSuite(suite);
    expect(suite.config?.runs).toBe(10);
    expect(suite.config?.min_pass).toBe(8);
  });

  it('should validate min_pass <= runs', () => {
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
      }],
      config: {
        runs: 3,
        min_pass: 5  // 无效：min_pass > runs
      }
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should validate scenario-level min_pass <= runs', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [],
        runs: 3,
        min_pass: 5  // 无效
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should validate runs is positive', () => {
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
      }],
      config: {
        runs: 0  // 无效
      }
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });
});

describe('judges config parsing', () => {
  it('should parse judges config', async () => {
    const yamlContent = `
name: test-suite
config:
  judges:
    code-reviewer:
      runner: opencode
      command: opencode
    quality-checker:
      runner: opencode
      command: mycode
scenarios:
  - name: test
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected: []
environments:
  default:
    directory: ./test
    setup: []
`;

    const result = parseAndValidateYaml(yamlContent);

    expect(result.config?.judges).toBeDefined();
    expect(result.config?.judges?.['code-reviewer']).toEqual({
      runner: 'opencode',
      command: 'opencode'
    });
    expect(result.config?.judges?.['quality-checker']).toEqual({
      runner: 'opencode',
      command: 'mycode'
    });
  });

  it('should parse judged_by assertion', async () => {
    const yamlContent = `
name: test-suite
scenarios:
  - name: test
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected:
          - judged_by:
              judge: code-reviewer
              prompt: "Check quality"
              timeout: 60000
environments:
  default:
    directory: ./test
    setup: []
`;

    const result = parseAndValidateYaml(yamlContent);

    const assertion = result.scenarios[0].steps[0].expected[0];
    expect('judged_by' in assertion).toBe(true);
    if ('judged_by' in assertion) {
      expect(assertion.judged_by.judge).toBe('code-reviewer');
      expect(assertion.judged_by.prompt).toBe('Check quality');
      expect(assertion.judged_by.timeout).toBe(60000);
    }
  });

  it('should parse judged_by with min_pass', async () => {
    const yamlContent = `
name: test-suite
scenarios:
  - name: test
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected:
          - judged_by:
              judge: reviewer
              prompt: "Review"
              min_pass: 4
environments:
  default:
    directory: ./test
    setup: []
`;

    const result = parseAndValidateYaml(yamlContent);

    const assertion = result.scenarios[0].steps[0].expected[0];
    if ('judged_by' in assertion) {
      expect(assertion.judged_by.min_pass).toBe(4);
    }
  });
});