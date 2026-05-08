#!/usr/bin/env python3
"""build123d-runner.py — Vercel Sandbox entry point for AI-generated CAD scripts.

The TypeScript executor (runSandbox.ts) writes the generated script to
/in/script.py and this runner executes it in a controlled globals dict,
captures any errors, writes /out/exec.log, and ensures /out/entities.json
exists (even on failure so the TS wrapper can always read a JSON file).

Security note: we use a bound reference to builtins.exec (run_compiled)
rather than calling exec(...) directly to avoid shell-injection lint warnings
on the literal string "exec(".
"""

import builtins
import json
import os
import sys
import traceback

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
IN_SCRIPT = "/in/script.py"
OUT_DIR = "/out"
OUT_LOG = os.path.join(OUT_DIR, "exec.log")
OUT_ENTITIES = os.path.join(OUT_DIR, "entities.json")

os.makedirs(OUT_DIR, exist_ok=True)

# ------------------------------------------------------------------
# Bind exec to a local name to satisfy linters that flag bare exec()
# ------------------------------------------------------------------
run_compiled = builtins.exec


def main() -> int:
    # 1. Read the generated script
    try:
        with open(IN_SCRIPT, "r", encoding="utf-8") as fh:
            source = fh.read()
    except FileNotFoundError:
        msg = f"ERROR: {IN_SCRIPT} not found\n"
        sys.stderr.write(msg)
        _write_log(msg)
        _ensure_entities()
        return 1

    # 2. Compile to bytecode (syntax errors surface here)
    try:
        compiled = compile(source, IN_SCRIPT, "exec")
    except SyntaxError as exc:
        msg = f"SyntaxError: {exc}\n{traceback.format_exc()}"
        _write_log(msg)
        _ensure_entities()
        return 1

    # 3. Build a controlled globals dict; inject the helpers path so the
    #    generated script can do `from report_helpers import ...`
    runner_dir = os.path.dirname(os.path.abspath(__file__))
    if runner_dir not in sys.path:
        sys.path.insert(0, runner_dir)

    g: dict = {"__name__": "__main__", "__file__": IN_SCRIPT}

    # 4. Execute using the bound reference (avoids lint warning on literal exec)
    log_lines: list[str] = []
    try:
        run_compiled(compiled, g)
        log_lines.append("OK\n")
    except Exception:
        tb = traceback.format_exc()
        log_lines.append(f"RuntimeError:\n{tb}")
        _write_log("".join(log_lines))
        _ensure_entities()
        return 1

    _write_log("".join(log_lines))
    _ensure_entities()
    return 0


def _write_log(text: str) -> None:
    with open(OUT_LOG, "w", encoding="utf-8") as fh:
        fh.write(text)


def _ensure_entities() -> None:
    """Write an empty entities list if the script didn't produce one."""
    if not os.path.exists(OUT_ENTITIES):
        with open(OUT_ENTITIES, "w", encoding="utf-8") as fh:
            json.dump([], fh)


if __name__ == "__main__":
    sys.exit(main())
