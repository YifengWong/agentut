import fs from 'fs-extra';
import * as path from 'path';

export interface InitOptions {
  withExample?: boolean;
}

export async function initProject(
  directory: string,
  options: InitOptions = {}
): Promise<void> {
  const fixturesDir = path.join(directory, 'fixtures');
  const testsDir = path.join(directory, 'tests');

  // Create directories (don't overwrite if exist)
  await fs.ensureDir(fixturesDir);
  await fs.ensureDir(testsDir);

  // Create example files if requested
  if (options.withExample) {
    const exampleEnvDir = path.join(fixturesDir, 'example-env');
    await fs.ensureDir(exampleEnvDir);
    await fs.writeFile(
      path.join(exampleEnvDir, 'sample.txt'),
      'This is a sample file for testing.\n'
    );

    const exampleYaml = `name: example-test
description: An example test suite for Agent VCR

environments:
  example-env:
    directory: ./fixtures/example-env
    setup: []

scenarios:
  - name: example-scenario
    environment: example-env
    cleanup: true
    steps:
      - input: "Read the sample.txt file and summarize it"
        expected:
          - should_call_tool: Read
          - response_contains: "sample"
        timeout: 60000

config:
  default_timeout: 120000
  parallel: false
`;

    await fs.writeFile(
      path.join(testsDir, 'example-test.yaml'),
      exampleYaml
    );
  }
}