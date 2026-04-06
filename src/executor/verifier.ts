import fs from 'fs-extra';
import * as path from 'path';
import {
  type Assertion,
  type OpenCodeRunOutput,
  type AssertionResult,
  type Matcher,
  type ToolCallAssertion,
  type FileContentAssertion
} from '../types/index.js';

/**
 * Type guard to check if a value is a string
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a Matcher object
 */
function isMatcher(value: unknown): value is Matcher {
  return typeof value === 'object' && value !== null &&
    ('equals' in value || 'contains' in value || 'regex' in value || 'oneOf' in value);
}

/**
 * Type guard to check if a value is a ToolCallAssertion object
 */
function isToolCallAssertion(value: unknown): value is ToolCallAssertion {
  return typeof value === 'object' && value !== null && 'name' in value;
}

/**
 * Type guard to check if a value is a FileContentAssertion object
 */
function isFileContentAssertion(value: unknown): value is FileContentAssertion {
  return typeof value === 'object' && value !== null && 'file' in value && 'text' in value;
}

/**
 * Verify that a specific tool was called in the outputs
 */
export function verifyShouldCallTool(
  outputs: OpenCodeRunOutput[],
  toolName: string
): AssertionResult {
  // Check both new format (part.tool) and legacy format (data.tool_name)
  const toolCalls = outputs.filter(output => {
    // New format: type: "tool_use", part.tool
    if (output.part?.tool) {
      return output.part.tool.toLowerCase() === toolName.toLowerCase();
    }
    // Legacy format: type: "tool_call", data.tool_name
    if (output.data?.tool_name) {
      return output.data.tool_name === toolName;
    }
    return false;
  });

  if (toolCalls.length > 0) {
    return {
      type: 'should_call_tool',
      value: toolName,
      passed: true,
      message: `Tool '${toolName}' was called ${toolCalls.length} times`
    };
  }

  return {
    type: 'should_call_tool',
    value: toolName,
    passed: false,
    message: `Tool '${toolName}' was not called`
  };
}

/**
 * Verify that a file was produced in the working directory
 */
export async function verifyShouldProduceFile(
  workDir: string,
  filePath: string
): Promise<AssertionResult> {
  // Handle absolute or relative paths
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(workDir, filePath);

  const exists = await fs.pathExists(fullPath);

  if (exists) {
    return {
      type: 'should_produce_file',
      value: filePath,
      passed: true,
      message: `File '${filePath}' exists`
    };
  }

  return {
    type: 'should_produce_file',
    value: filePath,
    passed: false,
    message: `File '${filePath}' not found`
  };
}

/**
 * Verify that a file contains specific content
 */
export async function verifyFileContentContains(
  workDir: string,
  filePath: string,
  content: string
): Promise<AssertionResult> {
  // Handle absolute or relative paths
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(workDir, filePath);

  const exists = await fs.pathExists(fullPath);

  if (!exists) {
    return {
      type: 'file_content_contains',
      value: { file: filePath, text: content },
      passed: false,
      message: `File '${filePath}' not found`
    };
  }

  try {
    const fileContent = await fs.readFile(fullPath, 'utf-8');

    if (fileContent.includes(content)) {
      return {
        type: 'file_content_contains',
        value: { file: filePath, text: content },
        passed: true,
        message: `Content '${content}' found in '${filePath}'`
      };
    }

    return {
      type: 'file_content_contains',
      value: { file: filePath, text: content },
      passed: false,
      message: `Content '${content}' not found in '${filePath}'`
    };
  } catch (error) {
    return {
      type: 'file_content_contains',
      value: { file: filePath, text: content },
      passed: false,
      message: `Error reading file '${filePath}': ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Verify that the response contains specific text
 */
export function verifyResponseContains(
  outputs: OpenCodeRunOutput[],
  text: string
): AssertionResult {
  // Check both new format (part.text) and legacy format (data.content)
  const textOutputs = outputs.filter(output => {
    // New format: type: "text", part.text
    if (output.type === 'text' && output.part?.text) {
      return true;
    }
    // Legacy format: type: "text", data.content
    if (output.data?.content) {
      return true;
    }
    return false;
  });

  const found = textOutputs.some(output => {
    // New format
    if (output.part?.text) {
      return output.part.text.includes(text);
    }
    // Legacy format
    if (output.data?.content) {
      return output.data.content.includes(text);
    }
    return false;
  });

  if (found) {
    return {
      type: 'response_contains',
      value: text,
      passed: true,
      message: `Text '${text}' found in response`
    };
  }

  return {
    type: 'response_contains',
    value: text,
    passed: false,
    message: `Text '${text}' not found in response`
  };
}

/**
 * Verify all assertions against outputs and working directory
 */
export async function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDir: string
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    if ('should_call_tool' in assertion) {
      const value = assertion.should_call_tool;
      if (isString(value)) {
        results.push(verifyShouldCallTool(outputs, value));
      } else if (isToolCallAssertion(value)) {
        // Matcher mode: will be implemented in Task 3
        results.push({
          type: 'should_call_tool',
          value: value,
          passed: false,
          message: 'ToolCallAssertion with Matcher is not yet implemented'
        });
      } else {
        results.push({
          type: 'should_call_tool',
          value: value,
          passed: false,
          message: 'Invalid should_call_tool assertion value'
        });
      }
    }

    if ('should_produce_file' in assertion) {
      const value = assertion.should_produce_file;
      if (isString(value)) {
        results.push(await verifyShouldProduceFile(workDir, value));
      } else if (isMatcher(value)) {
        // Matcher mode: will be implemented in Task 4
        results.push({
          type: 'should_produce_file',
          value: value,
          passed: false,
          message: 'should_produce_file with Matcher is not yet implemented'
        });
      } else {
        results.push({
          type: 'should_produce_file',
          value: value,
          passed: false,
          message: 'Invalid should_produce_file assertion value'
        });
      }
    }

    if ('file_content_contains' in assertion) {
      const assertionValue = assertion.file_content_contains;
      if ('file' in assertionValue && 'text' in assertionValue) {
        const { file, text } = assertionValue;
        if (isString(file) && isString(text)) {
          results.push(await verifyFileContentContains(workDir, file, text));
        } else if (isMatcher(file) || isMatcher(text)) {
          // Matcher mode: will be implemented in Task 5
          results.push({
            type: 'file_content_contains',
            value: { file, text } as FileContentAssertion,
            passed: false,
            message: 'file_content_contains with Matcher is not yet implemented'
          });
        } else {
          results.push({
            type: 'file_content_contains',
            value: { file, text },
            passed: false,
            message: 'Invalid file_content_contains assertion value'
          });
        }
      }
    }

    if ('response_contains' in assertion) {
      const value = assertion.response_contains;
      if (isString(value)) {
        results.push(verifyResponseContains(outputs, value));
      } else if (isMatcher(value)) {
        // Matcher mode: will be implemented in Task 6
        results.push({
          type: 'response_contains',
          value: value,
          passed: false,
          message: 'response_contains with Matcher is not yet implemented'
        });
      } else {
        results.push({
          type: 'response_contains',
          value: value,
          passed: false,
          message: 'Invalid response_contains assertion value'
        });
      }
    }
  }

  return results;
}