import { parse as parseYamlString } from 'yaml';
import {
  ValidationError,
  type YamlTestSuite,
  type Assertion
} from '../types/index.js';

const VALID_ASSERTION_TYPES = [
  'should_call_tool',
  'should_produce_file',
  'file_content_contains',
  'response_contains',
  'judged_by',
  'exec_command'
];

export function parseYaml(yamlString: string): YamlTestSuite {
  const parsed = parseYamlString(yamlString);
  return parsed as YamlTestSuite;
}

export function validateYamlTestSuite(suite: YamlTestSuite): void {
  // Validate name
  if (!suite.name || typeof suite.name !== 'string') {
    throw new ValidationError('Missing required field: name', 'name');
  }

  // Validate environments
  if (!suite.environments || typeof suite.environments !== 'object') {
    throw new ValidationError('Missing required field: environments', 'environments');
  }

  if (Object.keys(suite.environments).length === 0) {
    throw new ValidationError('environments must have at least one entry', 'environments');
  }

  // Validate each environment has required fields
  for (const [envName, envConfig] of Object.entries(suite.environments)) {
    if (!envConfig.directory || typeof envConfig.directory !== 'string') {
      throw new ValidationError(
        `Environment "${envName}" is missing required field: directory`,
        `environments.${envName}.directory`
      );
    }
    // setup 可选，默认空数组
    if (!envConfig.setup) {
      envConfig.setup = [];
    }
    if (!Array.isArray(envConfig.setup)) {
      throw new ValidationError(
        `Environment "${envName}": setup must be an array`,
        `environments.${envName}.setup`
      );
    }

    // Validate setup.copy format
    for (const action of envConfig.setup) {
      if (action.copy && !action.copy.includes('->')) {
        throw new ValidationError(
          `setup.copy must use "source -> target" format: ${action.copy}`,
          `environments.${envName}.setup.copy`
        );
      }
    }
  }

  // Validate scenarios
  if (!suite.scenarios || !Array.isArray(suite.scenarios)) {
    throw new ValidationError('Missing required field: scenarios', 'scenarios');
  }

  // Set default runs and min_pass if not provided
  if (suite.config?.runs === undefined) {
    suite.config = suite.config || {};
    suite.config.runs = 5;
  }
  if (suite.config?.min_pass === undefined) {
    suite.config = suite.config || {};
    suite.config.min_pass = 4;
  }

  // At this point, runs and min_pass are guaranteed to be set
  const configRuns = suite.config.runs!;
  const configMinPass = suite.config.min_pass!;

  // Validate runs and min_pass at global level
  if (configRuns <= 0) {
    throw new ValidationError('runs must be a positive integer', 'config.runs');
  }
  if (configMinPass <= 0) {
    throw new ValidationError('min_pass must be a positive integer', 'config.min_pass');
  }
  if (configMinPass > configRuns) {
    throw new ValidationError(
      `min_pass (${configMinPass}) cannot be greater than runs (${configRuns})`,
      'config.min_pass'
    );
  }

  // Validate and set defaults for scenario-level runs and min_pass
  for (const scenario of suite.scenarios) {
    // Validate scenario references a valid environment
    if (!scenario.environment || !(scenario.environment in suite.environments)) {
      throw new ValidationError(
        `Scenario "${scenario.name}" references non-existent environment: ${scenario.environment}`,
        'scenarios.environment'
      );
    }

    // If scenario specifies runs, validate it
    if (scenario.runs !== undefined) {
      if (scenario.runs <= 0) {
        throw new ValidationError(
          `Scenario "${scenario.name}": runs must be a positive integer`,
          `scenarios.${scenario.name}.runs`
        );
      }
    }

    // If scenario specifies min_pass, validate it
    if (scenario.min_pass !== undefined) {
      const effectiveRuns = scenario.runs ?? suite.config!.runs!;
      if (scenario.min_pass <= 0) {
        throw new ValidationError(
          `Scenario "${scenario.name}": min_pass must be a positive integer`,
          `scenarios.${scenario.name}.min_pass`
        );
      }
      if (scenario.min_pass > effectiveRuns) {
        throw new ValidationError(
          `Scenario "${scenario.name}": min_pass (${scenario.min_pass}) cannot be greater than runs (${effectiveRuns})`,
          `scenarios.${scenario.name}.min_pass`
        );
      }
    }

    // 验证 initial_session（可选）
    if (scenario.initial_session !== undefined) {
      if (typeof scenario.initial_session !== 'string') {
        throw new ValidationError(
          `Scenario "${scenario.name}": initial_session must be a string`,
          `scenarios.${scenario.name}.initial_session`
        );
      }
      if (scenario.initial_session.trim() === '') {
        throw new ValidationError(
          `Scenario "${scenario.name}": initial_session cannot be empty`,
          `scenarios.${scenario.name}.initial_session`
        );
      }
    }

    // Validate score config (if present)
    if (scenario.score) {
      // If prompt is set and non-empty, judge must exist and be valid
      if (scenario.score.prompt && scenario.score.prompt.trim() !== '') {
        if (!scenario.score.judge || scenario.score.judge.trim() === '') {
          throw new ValidationError(
            `Scenario "${scenario.name}": score.judge is required when score.prompt is set`,
            `scenarios.${scenario.name}.score.judge`
          );
        }
        if (!suite.config?.judges || !(scenario.score.judge in suite.config.judges)) {
          throw new ValidationError(
            `Scenario "${scenario.name}": score.judge "${scenario.score.judge}" not found in config.judges`,
            `scenarios.${scenario.name}.score.judge`
          );
        }
      }

      if (scenario.score.priority !== undefined && scenario.score.priority <= 0) {
        throw new ValidationError(
          `Scenario "${scenario.name}": score.priority must be a positive integer`,
          `scenarios.${scenario.name}.score.priority`
        );
      }

      if (scenario.score.min_score !== undefined &&
          (scenario.score.min_score < 0 || scenario.score.min_score > 100)) {
        throw new ValidationError(
          `Scenario "${scenario.name}": score.min_score must be between 0 and 100`,
          `scenarios.${scenario.name}.score.min_score`
        );
      }
    }

    // Validate assertions in steps
    for (const step of scenario.steps) {
      for (const assertion of step.expected) {
        const assertionKeys = Object.keys(assertion);
        const isValid = assertionKeys.some(key => VALID_ASSERTION_TYPES.includes(key));

        if (!isValid) {
          throw new ValidationError(
            `Invalid assertion type: ${assertionKeys.join(', ')}`,
            'scenarios.steps.expected'
          );
        }
      }

      // Set default timeout if not provided
      if (step.timeout === undefined) {
        step.timeout = suite.config?.default_timeout ?? 60000;
      }
    }
  }

  // Set default agent_cli if not provided
  if (!suite.config?.agent_cli) {
    suite.config = suite.config || {};
    suite.config.agent_cli = {
      runner: 'opencode',
      command: 'opencode'
    };
  }
}

export function parseAndValidateYaml(yamlString: string): YamlTestSuite {
  const suite = parseYaml(yamlString);
  validateYamlTestSuite(suite);
  return suite;
}