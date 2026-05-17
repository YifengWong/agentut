// plugins/opencode/agentut-plugins.ts
// OpenCode plugin injected by agentut during fixture setup.
// Runs inside the opencode process to mock tool calls.
//
// Mechanism:
//   1. tool.execute.before — detect matched rules, neutralize args to prevent side effects
//   2. tool.execute.after  — replace output/error with mock result

import fs from "node:fs";
import path from "node:path";
import type { Plugin, PluginInput } from "@opencode-ai/plugin";

// ===========================================================================
// Matcher logic (mirrors agentut's verifier.ts matchValue for consistency)
// ===========================================================================

interface MatcherObj {
  equals?: string;
  contains?: string;
  containsOneOf?: string[];
  regex?: string;
  oneOf?: string[];
}

function matchValue(actual: unknown, matcher: MatcherObj): boolean {
  const actualStr = String(actual ?? "");
  if (matcher.equals !== undefined) return actual === matcher.equals;
  if (matcher.contains !== undefined) return actualStr.includes(matcher.contains);
  if (matcher.containsOneOf !== undefined) return matcher.containsOneOf.some(sub => actualStr.includes(sub));
  if (matcher.regex !== undefined) {
    try { return new RegExp(matcher.regex).test(actualStr); }
    catch { return false; }
  }
  if (matcher.oneOf !== undefined) return matcher.oneOf.includes(actualStr);
  return false;
}

// ===========================================================================
// Types
// ===========================================================================

interface MockRule {
  tool: string;
  when?: Record<string, MatcherObj>[];
  output?: string;
  error?: string;
}

// ===========================================================================
// Neutralize table — maps tool → args transform to make execution harmless
// ===========================================================================

type Neutralizer = (args: Record<string, unknown>, emptyFile: string) => void;

const NEUTRALIZERS: Record<string, Neutralizer> = {
  read(args, emptyFile)  { (args as Record<string, unknown>).file_path = emptyFile; },
  write(args, emptyFile) { (args as Record<string, unknown>).file_path = emptyFile; },
  edit(args, emptyFile)  { (args as Record<string, unknown>).file_path = emptyFile; },
  bash(args, _emptyFile) { (args as Record<string, unknown>).command = "echo mock"; },
  grep(args, _emptyFile) { (args as Record<string, unknown>).path = "."; },
  glob(args, _emptyFile) { (args as Record<string, unknown>).pattern = "__agentut_mock_none__"; },
};

function neutralizeArgs(tool: string, args: Record<string, unknown>, emptyFile: string): boolean {
  const fn = NEUTRALIZERS[tool.toLowerCase()];
  if (!fn) return false;
  try {
    fn(args, fs.existsSync(emptyFile) ? emptyFile : (process.platform === "win32" ? "nul" : "/dev/null"));
    return true;
  } catch { return false; }
}

// ===========================================================================
// Rule matching (AND logic for when array)
// ===========================================================================

function matchRule(tool: string, args: Record<string, unknown>, rules: MockRule[]): MockRule | null {
  for (const rule of rules) {
    if (rule.tool.toLowerCase() !== tool.toLowerCase()) continue;
    if (!rule.when || rule.when.length === 0) return rule;

    const allMatch = rule.when.every(cond =>
      Object.entries(cond).every(([key, matcher]) =>
        matchValue((args as Record<string, unknown>)[key], matcher)
      )
    );
    if (allMatch) return rule;
  }
  return null;
}

// ===========================================================================
// Plugin entry point
// ===========================================================================

export default (async function agentutPlugin(input: PluginInput): Promise<Record<string, unknown>> {
  const { client, directory } = input;
  const rulesPath = path.join(directory, ".opencode", "plugins", "mock-rules.json");
  const emptyFile = path.join(directory, ".opencode", "plugins", ".mock-empty");

  async function log(level: "debug" | "info" | "warn" | "error", message: string): Promise<void> {
    try {
      await client.app.log({
        body: { service: "agentut-plugin", level, message }
      });
    } catch {
      // Logging failed — silently ignore to not disrupt the plugin
    }
  }

  function loadRules(): MockRule[] {
    try {
      const raw = fs.readFileSync(rulesPath, "utf-8");
      const parsed = JSON.parse(raw);
      return parsed.rules ?? [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log("error", `Failed to load mock-rules.json: ${msg}`);
      return [];
    }
  }

  const rules = loadRules();
  const hitMap = new Map<string, MockRule>();

  return {
    "tool.execute.before": async (ctx: { tool: string; sessionID: string; callID: string }, output: { args: Record<string, unknown> }): Promise<void> => {
      try {
        const matched = matchRule(ctx.tool, output.args, rules);
        if (!matched) return;
        hitMap.set(ctx.callID, matched);
        const neutralized = neutralizeArgs(ctx.tool, output.args, emptyFile);
        if (!neutralized) {
          await log("warn",
            `No neutralizer for tool '${ctx.tool}'. ` +
            `Mock output will be applied but side effects may still occur.`
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await log("error", `tool.execute.before error (tool=${ctx.tool}, callID=${ctx.callID}): ${msg}`);
      }
    },

    "tool.execute.after": async (ctx: { tool: string; sessionID: string; callID: string; args: Record<string, unknown> }, output: { title: string; output: string; metadata: Record<string, unknown> }): Promise<void> => {
      try {
        const rule = hitMap.get(ctx.callID);
        if (!rule) return;
        hitMap.delete(ctx.callID);

        if (rule.output !== undefined) {
          output.output = rule.output;
          output.title = `${ctx.tool} (mocked)`;
        } else if (rule.error !== undefined) {
          output.output = rule.error;
          output.title = `${ctx.tool} (mock error)`;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await log("error", `tool.execute.after error (tool=${ctx.tool}, callID=${ctx.callID}): ${msg}`);
      }
    },
  };
} satisfies Plugin);
