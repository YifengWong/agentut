import type {
  ExportedSession,
  SessionAnalysis,
  YamlTestSuite,
  StepConfig
} from '../types/index.js';

export function analyzeSession(session: ExportedSession): SessionAnalysis {
  const inputs: string[] = [];
  const toolCallsByInput: Map<number, string[]> = new Map();
  const fileChanges: string[] = [];

  let inputIndex = -1;

  for (const message of session.messages) {
    if (message.info.role === 'user') {
      for (const part of message.parts) {
        if (part.type === 'text' && part.text) {
          inputs.push(part.text);
          inputIndex++;
          toolCallsByInput.set(inputIndex, []);
        }
      }
    }

    if (message.info.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool_call' && part.tool_name) {
          const calls = toolCallsByInput.get(inputIndex) || [];
          calls.push(part.tool_name);
          toolCallsByInput.set(inputIndex, calls);
        }
      }
    }
  }

  // Extract file changes from summary
  if (session.info.summary?.diffs) {
    for (const diff of session.info.summary.diffs) {
      fileChanges.push(diff.path);
    }
  }

  return {
    inputs,
    toolCallsByInput,
    fileChanges,
    workingDirectory: session.info.directory
  };
}

export function generateYamlFromAnalysis(analysis: SessionAnalysis): YamlTestSuite {
  const steps: StepConfig[] = [];

  for (let i = 0; i < analysis.inputs.length; i++) {
    const step: StepConfig = {
      input: analysis.inputs[i],
      expected: [],
      timeout: 60000
    };

    // Add tool call assertions
    const toolCalls = analysis.toolCallsByInput.get(i) || [];
    for (const toolName of toolCalls) {
      step.expected.push({ should_call_tool: toolName });
    }

    steps.push(step);
  }

  // Add file changes to the last step
  if (analysis.fileChanges.length > 0 && steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    for (const filePath of analysis.fileChanges) {
      lastStep.expected.push({ should_produce_file: filePath });
    }
  }

  return {
    name: 'suggested-test',
    description: '从会话自动生成的测试用例',
    environments: {
      default: {
        directory: './fixtures/suggested-env',
        setup: []
      }
    },
    scenarios: [{
      name: 'suggested-scenario',
      environment: 'default',
      cleanup: true,
      steps: steps
    }],
    config: {
      default_timeout: 120000,
      parallel: false
    }
  };
}