import fs from 'fs-extra';
import * as path from 'path';
import { type Assertion, type OpenCodeRunOutput, type AssertionResult } from '../types/index.js';

/**
 * Verify that a specific tool was called in the outputs
 */
export function verifyShouldCallTool(
  outputs: OpenCodeRunOutput[],
  toolName: string
): AssertionResult {
  const toolCalls = outputs.filter(
    output => output.type === 'tool_call' && output.data?.tool_name === toolName
  );

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
  const textOutputs = outputs.filter(output => output.type === 'text');

  const found = textOutputs.some(output => {
    const content = output.data?.content || '';
    return content.includes(text);
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
      results.push(verifyShouldCallTool(outputs, assertion.should_call_tool));
    }

    if ('should_produce_file' in assertion) {
      results.push(await verifyShouldProduceFile(workDir, assertion.should_produce_file));
    }

    if ('file_content_contains' in assertion) {
      const { file, text } = assertion.file_content_contains;
      results.push(await verifyFileContentContains(workDir, file, text));
    }

    if ('response_contains' in assertion) {
      results.push(verifyResponseContains(outputs, assertion.response_contains));
    }
  }

  return results;
}