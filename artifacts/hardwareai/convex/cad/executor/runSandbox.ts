"use node";
// convex/cad/executor/runSandbox.ts
//
// Vercel Sandbox executor for AI-generated build123d scripts.
// This is a Convex "use node" action so it can import Node builtins and the
// @vercel/sandbox SDK which are unavailable in the default Convex runtime.
//
// Flow:
//   1. Create a Python 3.13 sandbox
//   2. Write the generated script to /in/script.py
//   3. Copy report_helpers.py alongside it
//   4. Run build123d-runner.py
//   5. Read /out/exec.log and /out/entities.json
//   6. Read /out/output.step and /out/output.glb if present
//   7. Stop the sandbox
//   8. Return a structured SandboxRunResult

import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface SandboxRunResult {
  /** True when the Python script exited 0 and entities.json was produced. */
  ok: boolean;
  /** Contents of /out/exec.log (stdout + stderr merged by the runner). */
  log: string;
  /** Parsed entities list from /out/entities.json, or [] on error. */
  entities: unknown[];
  /** Base64-encoded STEP file, or null if not produced. */
  step: string | null;
  /** Base64-encoded GLB file, or null if not produced. */
  glb: string | null;
}

// ---------------------------------------------------------------------------
// Paths to sandbox helper files (resolved relative to this source file)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SANDBOX_DIR = path.resolve(
  __dirname,
  "../../../scripts/sandbox"
);

function readHelperFile(name: string): string {
  return readFileSync(path.join(SANDBOX_DIR, name), "utf8");
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Run an AI-generated build123d Python script inside a Vercel Sandbox and
 * return structured output.
 *
 * @param scriptPython - The full Python source emitted by compileToBuild123d.
 */
export async function runSandbox(
  scriptPython: string
): Promise<SandboxRunResult> {
  const sb = await Sandbox.create({
    runtime: "python3.13",
    timeout: 120_000, // 2 minutes max
  });

  try {
    // 1. Install build123d and numpy
    await sb.runCommand("pip", [
      "install",
      "--quiet",
      "build123d==0.7.0",
      "numpy>=1.26",
    ]);

    // 2. Write input files
    await sb.fs.mkdir("/in", { recursive: true });
    await sb.fs.mkdir("/out", { recursive: true });

    await sb.fs.writeFile("/in/script.py", scriptPython, "utf8");
    await sb.fs.writeFile(
      "/in/report_helpers.py",
      readHelperFile("report_helpers.py"),
      "utf8"
    );
    await sb.fs.writeFile(
      "/in/build123d-runner.py",
      readHelperFile("build123d-runner.py"),
      "utf8"
    );

    // 3. Run the runner
    const result = await sb.runCommand("python3", ["/in/build123d-runner.py"]);
    const exitCode = result.exitCode;

    // 4. Read outputs
    const log = await _readText(sb, "/out/exec.log");
    const entitiesRaw = await _readText(sb, "/out/entities.json");
    const step = await _readBase64(sb, "/out/output.step");
    const glb = await _readBase64(sb, "/out/output.glb");

    let entities: unknown[] = [];
    try {
      entities = JSON.parse(entitiesRaw) as unknown[];
    } catch {
      // Leave entities as []
    }

    return {
      ok: exitCode === 0,
      log: log ?? "",
      entities,
      step,
      glb,
    };
  } finally {
    // Always stop the sandbox to avoid idle billing
    await sb.stop();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function _readText(sb: Sandbox, filePath: string): Promise<string> {
  try {
    return await sb.fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function _readBase64(sb: Sandbox, filePath: string): Promise<string | null> {
  try {
    const buf = await sb.fs.readFile(filePath);
    return buf.toString("base64");
  } catch {
    return null;
  }
}
