---
title: "CCR CLI Error Handling"
created: 2026-04-30
poured:
  - ccr-mol-hty7
  - ccr-mol-pblf
  - ccr-mol-97vc
  - ccr-mol-87t6
  - ccr-mol-vs0i
  - ccr-mol-b6u6
  - ccr-mol-f9lz
  - ccr-mol-cm1w
  - ccr-mol-s56a
  - ccr-mol-v9ah
  - ccr-mol-0r4l
  - ccr-mol-kqnm
  - ccr-mol-t152
  - ccr-mol-3cm5
  - ccr-mol-t9mn
  - ccr-mol-8mq6
  - ccr-mol-ly82
  - ccr-mol-iqv5
  - ccr-mol-fg89
  - ccr-mol-sy6h
  - ccr-mol-xkyt
  - ccr-mol-go7f
  - ccr-mol-z7e8
  - ccr-mol-e86p
  - ccr-mol-uial
  - ccr-mol-7a7x
  - ccr-mol-rdlp
  - ccr-mol-u7kv
  - ccr-mol-61ut
  - ccr-mol-tcl5
  - ccr-mol-3gzx
  - ccr-mol-v3mq
  - ccr-mol-e4vq
  - ccr-mol-bc09
  - ccr-mol-3h1c
  - ccr-mol-03it
  - ccr-mol-lhk8
  - ccr-mol-y6c4
  - ccr-mol-lzje
  - ccr-mol-tbwf
  - ccr-mol-nl9b
  - ccr-mol-13ad
  - ccr-mol-u6wb
  - ccr-mol-74j8
  - ccr-mol-adqz
  - ccr-mol-ftz7
iteration: 1
auto_discovery: false
auto_learnings: false
---
<project_specification>
<project_name>CCR CLI Error Handling</project_name>

  <overview>
    The CCR CLI has inconsistent, uninformative error handling across all commands.
    Errors silently vanish in 11 of 12 catch blocks in statusline.ts alone; raw
    Node.js Error objects are dumped to the terminal; spawn error listeners are
    copy-pasted 7 times; and two commands (status, activate) have zero error
    handling whatsoever. Exit codes are always 0 or 1 with no semantic meaning.

    This spec delivers a complete error handling overhaul: a centralized error
    utility, consistent user-facing messages with actionable hints, step-contextual
    failure reports for multi-step flows, meaningful exit codes, and log-file
    guidance. The critical path is T1 → T3 → T8 → T11 (160 minutes total).
  </overview>

  <context>
    <existing_patterns>
      - All packages use TypeScript 5.8.2 with strict mode; catch variables typed as `any` (no `unknown` in use)
      - ANSI color constants duplicated inline across 6+ files (modelSelector.ts, statusline.ts, preset/*.ts) — no shared constants
      - console.error() used directly everywhere; no wrapper or formatter abstraction exists
      - process.exit() called with 1 (34 sites) or 0; no semantic exit codes defined
      - Spawn child processes via Node.js `spawn()`; error listener pattern `.on("error", cb)` repeated 7 times identically
      - Config/preset operations use try-catch inconsistently — some rethrow, some swallow, some log
      - No test framework exists in the cli package (no jest, vitest, mocha)
      - esbuild used for build; ts-node for dev; TypeScript source in packages/cli/src/
    </existing_patterns>
    <integration_points>
      - packages/cli/src/cli.ts — main entry; 34 process.exit calls; houses 5 duplicate spawn error handlers
      - packages/cli/src/utils/index.ts — config file loading/saving/backup; 2 raw error object logs; 1 spawn error handler
      - packages/cli/src/utils/status.ts — showStatus() has no try-catch at all
      - packages/cli/src/utils/activateCommand.ts — activateCommand() has no try-catch at all
      - packages/cli/src/utils/statusline.ts — 1027 lines; 11 of 12 catch blocks silenced
      - packages/cli/src/utils/processCheck.ts — cleanupPidFile() and closeService() swallow errors silently
      - packages/cli/src/utils/codeCommand.ts — 1 spawn error handler; claudeProcess error path
      - packages/cli/src/utils/preset/commands.ts — inconsistent error handling per subcommand
      - packages/cli/src/utils/preset/install.ts — 10 distinct failure points, currently one generic message
      - packages/cli/src/utils/update.ts — checkForUpdates() and performUpdate() swallow errors
    </integration_points>
    <new_technologies>
      - No new dependencies needed; all improvements use Node.js built-ins and existing TypeScript patterns
    </new_technologies>
    <conventions>
      - All code comments MUST be in English
      - No test framework — smoke tests use a shell script that runs ccr commands and checks exit codes / output patterns
      - Build: pnpm build:cli (esbuild via tsup)
      - Error messages follow pattern: bold label + message + dim hint (see modelSelector.ts as the closest existing example)
      - File location for new utility: packages/cli/src/utils/errors.ts
    </conventions>
  </context>

  <tasks>

    <task id="errors-util" priority="0" category="infrastructure">
      <title>Create packages/cli/src/utils/errors.ts — centralized error utility</title>
      <description>
        All other tasks depend on this. Create a single module that defines:
        (1) exit code constants with semantic names,
        (2) error category type,
        (3) a printError(category, message, hint?) function that formats and
        prints a user-facing error line using ANSI codes,
        (4) ANSI color constants (RESET, BOLD, DIM, RED, YELLOW, CYAN) so
        downstream files can stop duplicating them.

        Exit code map:
          EXIT_OK = 0
          EXIT_USER_ERROR = 1       (bad args, invalid input)
          EXIT_CONFIG_ERROR = 2     (missing/corrupt config.json)
          EXIT_SERVICE_ERROR = 3    (daemon not running, port conflict)
          EXIT_SYSTEM_ERROR = 4     (filesystem, spawn, network)

        printError format:
          \n  ✗ [CATEGORY] message\n    → hint text (dim, if hint provided)\n

        Export all constants and functions. No default export.
      </description>
      <steps>
        - Create packages/cli/src/utils/errors.ts
        - Define EXIT_* numeric constants
        - Define ErrorCategory type: "config" | "service" | "system" | "input"
        - Define ANSI constants: RESET, BOLD, DIM, RED, YELLOW, CYAN
        - Implement printError(category: ErrorCategory, message: string, hint?: string): void
        - Export everything named (no default export)
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — verify zero TypeScript errors
        2. In a ts-node REPL or quick test script: import { printError, EXIT_CONFIG_ERROR } from "./utils/errors"
        3. Call printError("config", "Config file not found", "Run: ccr start to create one")
        4. Verify ANSI-formatted output appears with ✗ prefix, message, and dim hint line
        5. Verify EXIT_CONFIG_ERROR === 2
      </test_steps>
      <review></review>
    </task>

    <task id="dry-spawn-handlers" priority="1" category="infrastructure">
      <title>Extract duplicate spawn error handlers into a shared helper</title>
      <description>
        There are 7 identical `.on("error", (error) => { console.error(...); process.exit(1); })`
        blocks spread across cli.ts (lines 183, 230, 318, 349, 398), codeCommand.ts (134),
        and index.ts (230).

        Create a helper in errors.ts (or inline in cli.ts if it's too thin):
          attachSpawnErrorHandler(proc: ChildProcess, label: string): void

        It attaches an "error" listener that calls printError("system", \`Failed to start \${label}\`, hint)
        and exits with EXIT_SYSTEM_ERROR. Replace all 7 call sites.

        The hint should suggest checking logs: "Check logs at ~/.claude-code-router/logs/"
      </description>
      <steps>
        - Add attachSpawnErrorHandler(proc, label) to utils/errors.ts
        - Import ChildProcess type from node:child_process
        - Replace the 7 duplicate .on("error") blocks in cli.ts, codeCommand.ts, index.ts
        - Ensure each call site passes an appropriate label (e.g., "CCR server", "claude process")
        - Verify no functional change — only DRY refactor
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Run `grep -n 'on("error"' packages/cli/src/cli.ts packages/cli/src/utils/codeCommand.ts packages/cli/src/utils/index.ts` — should return 0 results (all replaced)
        3. Start ccr with an invalid command to force a spawn error — verify output uses printError format
        4. Verify exit code is EXIT_SYSTEM_ERROR (4), not 1
      </test_steps>
      <review></review>
    </task>

    <task id="fix-raw-error-logging" priority="1" category="functional">
      <title>Replace raw Error object logging with error.message across all sites</title>
      <description>
        These sites pass the entire Error object to console.error(), dumping stack
        traces and [object Object] noise to the terminal:
          - cli.ts:231  — "Failed to start service:", error
          - utils/index.ts:152 — "Failed to backup config file:", error
          - utils/index.ts:231 — "Failed to start service:", error
          - utils/statusline.ts:207 — "Error executing script:", error

        Also fix 7 sites using `error: any` type annotation in catch blocks
        (installCommand.ts, modelSelector.ts, index.ts, preset/commands.ts, preset/export.ts)
        — change these to use `instanceof Error ? error.message : String(error)` pattern.

        Where context warrants, replace console.error() with printError() from errors.ts.
        Where the caller is non-interactive (statusline.ts), use console.error with
        error.message only — do not call process.exit.
      </description>
      <steps>
        - Fix cli.ts:231 — use printError("system", ..., hint)
        - Fix utils/index.ts:152 — use printError("system", ...)
        - Fix utils/index.ts:231 — use printError("system", ...)
        - Fix utils/statusline.ts:207 — use console.error with error.message (non-interactive, no exit)
        - Audit and fix the 7 catch blocks with `error: any` — replace with safe message extraction
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Trigger a config backup failure (make the backup dir read-only temporarily)
        3. Verify output shows a formatted message, not a raw Error object or stack trace
        4. Run `grep -n "console.error.*error[^.]" packages/cli/src/ -r` — verify no raw error object dumps remain
      </test_steps>
      <review></review>
    </task>

    <task id="guard-status-command" priority="1" category="functional">
      <title>Add error handling to the status command (showStatus has no try-catch)</title>
      <description>
        utils/status.ts:showStatus() is called from cli.ts with no error handling.
        If getServiceInfo() throws (e.g., PID file corrupt, process check fails),
        the raw Node.js error propagates to the top-level unhandled rejection.

        Wrap the showStatus() call site in cli.ts with a try-catch that calls
        printError("service", "Could not retrieve status", hint) and exits with
        EXIT_SERVICE_ERROR. Alternatively wrap the body of showStatus() itself
        if that's cleaner — but do NOT do both (would double-report).
      </description>
      <steps>
        - Locate the `ccr status` handler in cli.ts (line ~267)
        - Wrap the await showStatus() call in try-catch
        - In catch: call printError("service", "Could not retrieve server status", "Try: ccr restart")
        - Exit with EXIT_SERVICE_ERROR (3)
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Corrupt the PID file: `echo "bad" > ~/.claude-code-router/ccr.pid`
        3. Run `ccr status`
        4. Verify formatted error message appears (not a raw stack trace)
        5. Verify exit code: `echo $?` should be 3
        6. Restore PID file or stop service cleanly afterward
      </test_steps>
      <review></review>
    </task>

    <task id="guard-activate-command" priority="1" category="functional">
      <title>Add error handling to the activate command (activateCommand has no try-catch)</title>
      <description>
        utils/activateCommand.ts:activateCommand() calls createEnvVariables() and
        writeShellConfig() with no error handling. A filesystem error produces an
        unhandled rejection with a raw stack trace.

        Wrap the activateCommand() call site in cli.ts with try-catch that calls
        printError("system", "Failed to write shell activation config", hint)
        and exits with EXIT_SYSTEM_ERROR.
      </description>
      <steps>
        - Locate the `ccr activate` / `ccr env` handler in cli.ts (line ~305)
        - Wrap the await activateCommand() call in try-catch
        - In catch: call printError("system", "Failed to write shell activation config", "Check file permissions for your shell config file")
        - Exit with EXIT_SYSTEM_ERROR (4)
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Make the shell config file read-only: `chmod 444 ~/.zshrc` (restore after test)
        3. Run `ccr activate`
        4. Verify formatted error message appears with hint
        5. Verify exit code: `echo $?` should be 4
        6. Restore permissions: `chmod 644 ~/.zshrc`
      </test_steps>
      <review></review>
    </task>

    <task id="fix-silenced-errors" priority="1" category="functional">
      <title>Fix silenced catch blocks in statusline.ts, processCheck.ts, and update.ts</title>
      <description>
        11 of 12 catch blocks in statusline.ts are silent. Several in processCheck.ts
        and update.ts are also silenced. Many have commented-out console.error or
        "ignore error" comments.

        Strategy by severity:
        - statusline.ts: These are non-interactive display functions. Silent failure
          is acceptable for individual widget data (git branch, token speed, theme).
          BUT change from empty catch to `catch (_e)` with a comment explaining why
          silence is intentional. For the script execution catch (line 206), keep the
          console.error but use error.message only.
        - processCheck.ts:cleanupPidFile() — currently swallows unlink errors. Change
          to console.warn with a message (non-fatal but worth surfacing).
        - processCheck.ts:closeService() — swallows process.kill errors. Change to
          console.warn.
        - update.ts:checkForUpdates() — swallows npm view errors. Change to console.warn.
        - update.ts:performUpdate() — swallows npm update errors. Change to printError
          if error is meaningful, else console.warn.

        This task is NOT about making everything loud — it's about making intentional
        silence explicit and surfacing non-display errors appropriately.
      </description>
      <steps>
        - statusline.ts lines 440, 447, 478, 493, 510, 541, 645, 670, 686, 701, 782:
          rename `catch (error)` / `catch` to `catch (_e)` and add brief English comment
        - statusline.ts:207: change `console.error(..., error)` to `console.error(..., error instanceof Error ? error.message : String(error))`
        - processCheck.ts:cleanupPidFile() catch: add `console.warn("Could not remove PID file:", path)`
        - processCheck.ts:closeService() catch: add `console.warn("Could not signal process to stop — it may have already exited")`
        - update.ts:checkForUpdates() catch: add `console.warn("Update check failed:", ...)`
        - update.ts:performUpdate() catch: call printError or console.warn depending on severity
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Run `grep -n "catch {" packages/cli/src/utils/statusline.ts` — should return 0 (all renamed to catch (_e))
        3. Delete the PID file while a process is "running" and run `ccr stop` — verify console.warn appears
        4. Run `ccr status` with no network to test update check — verify console.warn if npm view fails
        5. Run full `ccr statusline` with a sample JSON payload — verify statusline renders normally (no regressions)
      </test_steps>
      <review></review>
    </task>

    <task id="preset-install-steps" priority="2" category="functional">
      <title>Add step-contextual error messages to the preset install flow</title>
      <description>
        utils/preset/install.ts has 10 distinct failure points but surfaces a single
        generic "Failed to install preset:" message. Users cannot tell if the failure
        was at download, validation, input collection, manifest save, or apply.

        Wrap each of the 10 failure points with a specific printError call that names
        the step. Use EXIT_USER_ERROR for invalid source/name conflicts, EXIT_SYSTEM_ERROR
        for filesystem/download failures.

        Failure point → message mapping:
          1. URL validation → "URL sources not supported — provide a local directory path"
          2. Directory not found → "Preset source directory not found: \${source}"
          3. Name conflict → "Preset '\${name}' is already installed — use --reconfigure to update"
          4. Preset not found (reconfigure) → "No installed preset named '\${name}'"
          5. Manifest read failure → "Could not read preset manifest from \${source}"
          6. Preset validation failure → "Preset manifest is invalid: \${validationError}"
          7. Input collection failure → "Preset input collection was cancelled"
          8. Manifest save failure → "Failed to save preset manifest to \${destPath}"
          9. Apply failure → "Failed to apply preset '\${name}' to config"
          10. General catch-all → "Preset install failed at an unknown step"
      </description>
      <steps>
        - Import { printError, EXIT_USER_ERROR, EXIT_SYSTEM_ERROR } into preset/install.ts and preset/commands.ts
        - Replace or augment each of the 10 throw/catch sites with labeled printError calls
        - For steps 1–4 (user input problems): use EXIT_USER_ERROR, include a fix hint
        - For steps 5–9 (system problems): use EXIT_SYSTEM_ERROR, hint at log location
        - Remove the generic outer catch message in preset/commands.ts:handlePresetCommand()
          or make it a catch-all only for unexpected errors
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Run `ccr preset install /nonexistent/path` — verify step-specific message: "Preset source directory not found"
        3. Install a preset successfully, then run install again — verify name conflict message
        4. Provide a directory missing manifest.json — verify manifest read failure message
        5. Verify exit codes are correct (user errors → 1, system errors → 4)
      </test_steps>
      <review></review>
    </task>

    <task id="ui-command-errors" priority="2" category="functional">
      <title>Add step-contextual error messages to the ui command's 4 error handlers</title>
      <description>
        The `ccr ui` command in cli.ts has 4 separate error handlers in deeply nested
        callbacks (lines ~349, ~398, ~415, ~451). Each uses generic messages or silently
        falls through. Users cannot tell if the failure was in starting the server,
        retrying with a default config, creating the fallback config, or opening the browser.

        The 4 handler sites and their improved messages:
          Line ~349 (initial server spawn error) →
            printError("service", "Failed to start UI server", "Try: ccr restart")
          Line ~398 (retry server spawn after fallback config) →
            printError("service", "Failed to start UI server with default config", "Check logs at ~/.claude-code-router/logs/")
          Line ~415 (fallback config creation error) →
            printError("config", "Could not create default UI config", "Check write permissions for ~/.claude-code-router/")
          Line ~451 (browser open error) →
            printError("system", "Could not open browser automatically", "Open manually: http://localhost:\${port}")

        Use attachSpawnErrorHandler for the two spawn cases (lines 349, 398).
      </description>
      <steps>
        - Identify and locate the 4 error handler sites in cli.ts ui command block
        - Replace lines ~349 and ~398 with attachSpawnErrorHandler calls (from T3)
        - Replace line ~415 with printError("config", ...) + EXIT_CONFIG_ERROR
        - Replace line ~451 with printError("system", ...) + EXIT_SYSTEM_ERROR
        - Ensure the browser-open failure is non-fatal if the server started successfully
          (warn, don't exit — user can open manually)
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Block the UI port: `lsof -ti:7080 | xargs kill -9` then occupy it: `nc -l 7080 &`
        3. Run `ccr ui` — verify "Failed to start UI server" message appears
        4. Kill the nc process: `kill %1`
        5. Run `ccr ui` again — verify it succeeds and prints the manual URL in case browser fails
        6. Verify no raw Error objects appear in any failure path
      </test_steps>
      <review></review>
    </task>

    <task id="exit-codes" priority="2" category="functional">
      <title>Apply meaningful exit codes across all CLI commands</title>
      <description>
        Currently every failure exits with 1. With EXIT_* constants defined in T1,
        apply them consistently across all 34 process.exit() call sites in cli.ts
        and the utils files.

        Mapping by command:
          start   → service not running after timeout: EXIT_SERVICE_ERROR (3)
          stop    → no process to stop: EXIT_OK (0); kill failure: EXIT_SYSTEM_ERROR (4)
          restart → propagates from stop/start
          status  → already handled in T4
          code    → spawn failure: EXIT_SYSTEM_ERROR; bad args: EXIT_USER_ERROR
          model   → bad config write: EXIT_CONFIG_ERROR
          preset  → already handled in T7
          activate → already handled in T5
          ui      → already handled in T8

        Replace all hard-coded process.exit(1) with the semantic constant.
        Document exit codes in the --help output (add a brief "Exit codes:" section).
      </description>
      <steps>
        - Import EXIT_* constants in cli.ts and each utils file that calls process.exit
        - Replace each process.exit(1) with the appropriate semantic constant
        - Add "Exit codes:" section to the help text string in cli.ts
        - Verify process.exit(0) calls remain as EXIT_OK
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Run `ccr --help` — verify exit codes section appears
        3. Run `ccr start` when server fails to bind — verify `echo $?` returns 3
        4. Run `ccr stop` when no server is running — verify `echo $?` returns 0 (not an error)
        5. Run `ccr preset install /invalid` — verify `echo $?` returns 1 (user error)
        6. Run `grep -n "process.exit(1)" packages/cli/src/ -r` — should return 0 (all replaced)
      </test_steps>
      <review></review>
    </task>

    <task id="log-hints" priority="3" category="functional">
      <title>Add log file location hints to EXIT_SYSTEM_ERROR and EXIT_SERVICE_ERROR paths</title>
      <description>
        When a system or service error occurs and there's nothing more the user can do
        without more information, printError should hint at the log location.

        The log path is defined in CLAUDE.md as ~/.claude-code-router/logs/ccr-*.log.
        Add a LOG_PATH constant to errors.ts derived from os.homedir().

        Update printError to accept an optional showLogs flag (default false). When
        true, append a dim "Logs: \${LOG_PATH}" line after the hint.

        Update all EXIT_SYSTEM_ERROR and EXIT_SERVICE_ERROR call sites to pass
        showLogs: true (or set it as the default for those categories — your call,
        but be consistent).
      </description>
      <steps>
        - Import os from "node:os" in errors.ts
        - Define LOG_PATH = path.join(os.homedir(), ".claude-code-router", "logs")
        - Add optional showLogs parameter to printError (or auto-derive from category)
        - Update printError output to append dim "Logs: \${LOG_PATH}/ccr-*.log" when appropriate
        - Walk all EXIT_SYSTEM_ERROR and EXIT_SERVICE_ERROR sites and enable log hints
      </steps>
      <test_steps>
        1. Run `pnpm build:cli` — zero TypeScript errors
        2. Trigger any system error (e.g., invalid spawn)
        3. Verify output includes "Logs: ~/.claude-code-router/logs/ccr-*.log" in dim text
        4. Trigger a user error (bad args) — verify log hint does NOT appear (not relevant)
        5. Verify EXIT_CONFIG_ERROR paths: log hint appears (config errors benefit from log context)
      </test_steps>
      <review></review>
    </task>

    <task id="smoke-tests" priority="2" category="infrastructure">
      <title>Write shell-based smoke tests for all error paths</title>
      <description>
        No test framework exists. Write a shell script at packages/cli/test/error-smoke.sh
        that exercises each improved error path and asserts:
          (a) the expected exit code
          (b) that the output contains the expected error label string

        Tests to cover (minimum):
          1. ccr status with corrupt PID file → exit 3, contains "Could not retrieve"
          2. ccr preset install /nonexistent → exit 1, contains "not found"
          3. ccr preset install of already-installed preset → exit 1, contains "already installed"
          4. ccr activate with read-only shell config → exit 4, contains "Failed to write"
          5. ccr stop when no server running → exit 0
          6. ccr --help → contains "Exit codes:"
          7. Verify no output contains "[object Object]" (raw error objects)

        The script should print PASS/FAIL per test and exit 1 if any fail.
        Add a `pnpm test:errors` script to packages/cli/package.json.
      </description>
      <steps>
        - Create packages/cli/test/ directory
        - Write packages/cli/test/error-smoke.sh with the 7+ test cases above
        - Make the script executable: chmod +x
        - Add test:errors script to packages/cli/package.json: "bash test/error-smoke.sh"
        - Run all tests and verify they pass
        - Add a note in CLAUDE.md that error paths are covered by test/error-smoke.sh
      </steps>
      <test_steps>
        1. Run `pnpm --filter @musistudio/claude-code-router test:errors`
        2. Verify all tests report PASS
        3. Deliberately break one error message (change a string), re-run — verify it reports FAIL
        4. Revert the break, re-run — verify PASS again
      </test_steps>
      <review></review>
    </task>

  </tasks>

  <success_criteria>
    - Zero raw Error objects in terminal output for any ccr command
    - Zero unhandled rejections — all commands have try-catch coverage
    - Spawn error listeners deduplicated to one shared helper
    - Silent catch blocks in non-display code are gone; in display-only code they use catch (_e) with comment
    - Exit codes are semantic (0/1/2/3/4) and documented in --help
    - Multi-step flows (preset install, ui) report the failing step by name
    - Smoke test script passes for all 7+ error path assertions
    - pnpm build:cli completes with zero TypeScript errors
  </success_criteria>

</project_specification>
