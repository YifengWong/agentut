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
  'response_contains'
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
    if (!Array.isArray(envConfig.setup)) {
      throw new ValidationError(
        `Environment "${envName}" is missing required field: setup (must be an array)`,
        `environments.${envName}.setup`
      );
    }
  }

  // Validate scenarios
  if (!suite.scenarios || !Array.isArray(suite.scenarios)) {
    throw new ValidationError('Missing required field: scenarios', 'scenarios');
  }

  // Validate each scenario references a valid environment
  for (const scenario of suite.scenarios) {
    if (!scenario.environment || !(scenario.environment in suite.environments)) {
      throw new ValidationError(
        `Scenario "${scenario.name}" references non-existent environment: ${scenario.environment}`,
        'scenarios.environment'
      );
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
}

export function parseAndValidateYaml(yamlString: string): YamlTestSuite {
  const suite = parseYaml(yamlString);
  validateYamlTestSuite(suite);
  return suite;
}