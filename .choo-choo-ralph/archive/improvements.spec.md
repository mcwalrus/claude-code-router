---
title: "Multi-Worktree Coordination Improvements"
created: 2026-04-30
poured:
  - ccr-mol-02sh
  - ccr-mol-9tpt
  - ccr-mol-4lpo
  - ccr-mol-vejy
  - ccr-mol-oy5n
  - ccr-mol-hqlw
  - ccr-mol-oinh
  - ccr-mol-zcka
  - ccr-mol-mf7r
  - ccr-mol-hd9t
  - ccr-mol-qd8e
  - ccr-mol-hss3
  - ccr-mol-c4d5
iteration: 1
auto_discovery: false
auto_learnings: false
---
<project_specification>
<project_name>Multi-Worktree Coordination Improvements</project_name>

  <overview>
    This repo runs multiple Claude Code worktrees in parallel (currently: temporal-floating-lark,
    zazzy-tumbling-lecun, and possibly others). Without coordination, concurrent sessions race on
    shared resources: .beads/issues.jsonl (Dolt-backed issue state), node_modules (symlinked),
    settings.local.json (shared permission grants), and the CCR server PID singleton.

    The goal is to introduce low-friction, hook-enforced discipline so any worktree session can
    start cleanly, claim work safely, and close without leaving orphaned state or Dolt conflicts.
    All improvements are additive to .claude/settings.json and CLAUDE.md — no new dependencies.

    Execution: single runner, sequential tasks.
  </overview>

  <context>
    <existing_patterns>
      - SessionStart and PreCompact hooks already exist in .claude/settings.json, both running `bd prime`
      - Hook structure: { "hooks": [{ "hooks": [{ "command": "...", "type": "command" }], "matcher": "" }] }
      - worktree.symlinkDirectories: ["node_modules"] is set — all worktrees share one node_modules
      - .beads/formulas/ contains choo-choo-ralph.formula.json as the only formula
      - Git hooks in .beads/hooks/ (pre-commit, post-merge, etc.) use timeout-safe `bd hooks run` pattern
      - CLAUDE.md Session Completion section (lines 294-319) mandates git push as final step
      - Justfile has agent-dev, agent-list, agent-stop targets for container-based CCR isolation per worktree
    </existing_patterns>
    <integration_points>
      - .claude/settings.json — primary hook configuration file (shared across all worktrees via symlink)
      - CLAUDE.md — process documentation; the multi-worktree section goes after "Beads Issue Tracker"
      - .beads/issues.jsonl — 517-line JSONL; never edit directly; coordinate via bd dolt pull/push
      - .beads/config.yaml — beads config; Dolt enabled (no-db: false), backup enabled
      - settings.local.json — accumulates session permissions; shared, affects all worktrees
    </integration_points>
    <new_technologies>
      - Claude Code Stop hook: fires when agent session terminates naturally; valid hook type alongside
        SessionStart, PreCompact, PreToolUse, PostToolUse, Notification
      - Claude Code PreToolUse hook: fires before any tool call; matcher field filters by tool name (e.g., "Bash")
      - bd label: labels can be added to issues for ownership tagging (wt:&lt;worktree-name&gt; convention)
      - bd remember: persists key-value insights to beads memory across sessions
    </new_technologies>
    <conventions>
      - All hook commands use "type": "command"
      - Multiple hooks in same event type are listed as array items under "hooks"
      - English-only comments in code (per CLAUDE.md)
      - bd commands are the only way to mutate issue state — never edit .beads/ files directly
      - settings.json is shared (committed); settings.local.json is local (gitignored or per-machine)
    </conventions>
  </context>

  <tasks>

    <task id="session-start-hook" priority="1" category="infrastructure">
      <title>Extend SessionStart hook: pull beads state and show active sessions</title>
      <description>
        The current SessionStart hook only runs `bd prime`. When a second worktree session starts,
        it has no visibility into what other sessions have claimed. Adding `bd dolt pull` ensures
        the session starts with current claim state from Dolt remote. Adding `bd list --status=in_progress`
        surfaces any in-flight claims before the agent picks up new work.

        Edit .claude/settings.json to append two commands to the existing SessionStart hook's
        hooks array. The hook array currently has one item (bd prime); add bd dolt pull and
        bd list --status=in_progress as additional items in the same array.
      </description>
      <steps>
        - Read current .claude/settings.json to confirm existing SessionStart hook structure
        - Append { "command": "bd dolt pull", "type": "command" } to the SessionStart hooks array
        - Append { "command": "bd list --status=in_progress", "type": "command" } after the pull
        - Verify JSON is valid (use `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`)
        - Run `bd dolt pull` manually to confirm it works in this worktree
      </steps>
      <test_steps>
        1. Read .claude/settings.json and confirm SessionStart.hooks array has 3 items
        2. Confirm order: bd prime → bd dolt pull → bd list --status=in_progress
        3. Run `bd dolt pull` from this worktree — verify it exits 0 with no errors
        4. Run `bd list --status=in_progress` — verify it prints current in-progress issues
        5. Confirm JSON validates: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`
      </test_steps>
      <review></review>
    </task>

    <task id="stop-hook" priority="1" category="infrastructure">
      <title>Add Stop hook: auto-push beads state on session end</title>
      <description>
        When a Claude Code session ends (naturally or via /stop), beads claim changes and issue
        closures need to reach Dolt remote so other sessions see them. Currently this relies on
        the agent remembering to run `bd dolt push` manually — which is skipped during context
        pressure or abrupt stops.

        Add a Stop hook to .claude/settings.json that runs `bd dolt push`. This is a new top-level
        key in the hooks object alongside the existing PreCompact and SessionStart keys.

        Note: the Stop hook fires when the Claude Code agent stops. It may not fire on hard kills
        (SIGKILL), but covers normal session termination and /stop commands.
      </description>
      <steps>
        - Read .claude/settings.json to confirm current hooks structure
        - Add "Stop" key to the hooks object at the same level as "PreCompact" and "SessionStart"
        - Structure: { "hooks": [{ "hooks": [{ "command": "bd dolt push", "type": "command" }], "matcher": "" }] }
        - Validate JSON after edit
        - Test `bd dolt push` manually to confirm it succeeds (or is a no-op if already in sync)
      </steps>
      <test_steps>
        1. Read .claude/settings.json — confirm "Stop" key exists at top level of hooks object
        2. Confirm Stop hook runs: { "command": "bd dolt push", "type": "command" }
        3. Run `bd dolt push` manually — verify exit 0 (may say "already up to date")
        4. Confirm JSON validates cleanly
        5. Confirm no other hooks were accidentally modified
      </test_steps>
      <review></review>
    </task>

    <task id="pnpm-guard" priority="2" category="infrastructure">
      <title>Add PreToolUse hook: warn on pnpm install from worktree path</title>
      <description>
        node_modules is symlinked from the main repo to all worktrees. Running `pnpm install`
        inside a worktree path modifies the shared node_modules immediately, potentially breaking
        other active worktree sessions. settings.local.json already allows Bash(pnpm install),
        so there is no permission guard.

        Add a PreToolUse hook with matcher "Bash" that prints a warning when the current working
        directory contains "/worktrees/" and the tool input contains "pnpm install". The hook
        should warn but NOT block (exit 0) — the agent may have a legitimate reason, and
        we want visibility not a hard failure.

        Warning message: "WARNING: pnpm install from a worktree modifies shared node_modules —
        consider running from the main repo instead."
      </description>
      <steps>
        - Add "PreToolUse" key to the hooks object in .claude/settings.json
        - Set matcher to "Bash" to filter only Bash tool calls
        - Command: a bash one-liner that checks `pwd` for "/worktrees/" AND checks
          CLAUDE_TOOL_INPUT (or equivalent env var available in PreToolUse hooks) for "pnpm install"
          then echoes the warning if both conditions match
        - Research which environment variable carries the tool input in PreToolUse hooks
          (check Claude Code docs or existing hook examples); if unavailable, use a simpler
          path-only check: warn whenever pwd contains /worktrees/ and skip input inspection
        - Validate JSON after edit
      </steps>
      <test_steps>
        1. Read .claude/settings.json — confirm "PreToolUse" key exists with matcher "Bash"
        2. Confirm the hook command is syntactically valid bash (run it directly in terminal)
        3. Simulate: cd into a worktree path and run the hook command manually — verify warning prints
        4. Simulate: cd into main repo and run the hook command — verify no warning
        5. Confirm JSON validates cleanly
      </test_steps>
      <review></review>
    </task>

    <task id="ownership-tagging" priority="1" category="functional">
      <title>Establish issue ownership tagging and persist protocol via bd remember</title>
      <description>
        There is no current enforcement of which worktree owns which issue. Two sessions can
        simultaneously claim the same issue, write divergent notes, and produce a Dolt conflict
        on push. The worktree label convention (wt:&lt;worktree-name&gt;) makes ownership visible
        in bd search and bd show output.

        This task has two parts:
        1. Define and demonstrate the tagging convention: when claiming an issue, also add a
           worktree label. Retroactively tag the current in-progress issue (ccr-mol-fpi) with
           the label for this worktree (wt:temporal-floating-lark).
        2. Persist the key multi-worktree rules to beads memory via `bd remember` so future
           sessions recover the protocol without reading CLAUDE.md first.

        Rules to remember:
        - "Always bd dolt pull before claiming an issue; always bd dolt push at session end"
        - "When claiming an issue, add a worktree label: bd label &lt;id&gt; add wt:&lt;worktree-name&gt;"
        - "Never run pnpm install from a worktree path — it modifies shared node_modules"
        - "Only one worktree runs ccr start at a time; check ccr status before starting"
        - "Never edit .beads/ files directly; all mutations go through bd commands"
      </description>
      <steps>
        - Run `bd label --help` or `bd help label` to confirm label subcommand syntax
        - Add worktree label to current in-progress issue: `bd label ccr-mol-fpi add wt:temporal-floating-lark`
        - Verify label was added: `bd show ccr-mol-fpi`
        - Run `bd remember` for each of the 5 rules listed above (run sequentially)
        - Verify memories were stored: `bd memories worktree`
        - Run `bd memories pnpm` to verify that rule is also retrievable
      </steps>
      <test_steps>
        1. Run `bd show ccr-mol-fpi` — confirm "wt:temporal-floating-lark" label appears
        2. Run `bd memories worktree` — confirm at least one memory about dolt pull/push appears
        3. Run `bd memories pnpm` — confirm the node_modules guard rule appears
        4. Run `bd memories ccr` — confirm the CCR server singleton rule appears
        5. Run `bd search "wt:temporal-floating-lark"` — confirm tagged issue is findable by label
      </test_steps>
      <review></review>
    </task>

    <task id="claude-md-update" priority="2" category="documentation">
      <title>Add Multi-Worktree Collaboration section to CLAUDE.md</title>
      <description>
        CLAUDE.md currently mentions worktrees only in passing (line 266: "Worktrees symlink
        node_modules...") and has no process guidance for concurrent sessions. The Session
        Completion section mandates `bd dolt push` as part of the push sequence, but doesn't
        address session START discipline or issue claiming coordination.

        Add a "Multi-Worktree Collaboration" section to CLAUDE.md immediately after the
        "Beads Issue Tracker" section and before "Session Completion". The section covers:
        - Session start checklist (dolt pull, check in_progress, then claim)
        - Issue claiming protocol (bd update --claim + bd label with wt: label)
        - Shared resource hard rules (pnpm, settings.local.json, CCR server, .beads/ files)
        - Session end checklist (commit code, bd dolt push, close issues)

        Also update the existing Session Completion section to explicitly include
        `bd dolt push` in the mandatory push sequence if not already there (it is, but
        verify the wording makes clear this is required even when no git push occurs).
      </description>
      <steps>
        - Read CLAUDE.md to find the exact insertion point (after Beads section, before Session Completion)
        - Write the Multi-Worktree Collaboration section with the four subsections listed above
        - Include concrete command examples for each rule (not just prose)
        - Verify the Session Completion section already includes `bd dolt push` — if the wording
          implies it's optional, tighten it
        - Keep the section under 60 lines — prefer command blocks over prose
      </steps>
      <test_steps>
        1. Read CLAUDE.md — confirm "Multi-Worktree Collaboration" heading exists
        2. Confirm section contains: session start checklist, claiming protocol, shared resource rules, session end checklist
        3. Confirm each rule has a concrete command example (not just description)
        4. Confirm the section is positioned between Beads Issue Tracker and Session Completion
        5. Read Session Completion section — confirm `bd dolt push` is clearly mandatory (not buried)
      </test_steps>
      <review></review>
    </task>

    <task id="issue-hygiene" priority="3" category="functional">
      <title>Clean up orphaned and stale blocked issues</title>
      <description>
        bd blocked reports 173 blocked issues. This level of noise defeats the coordination
        protocol: `bd list --status=in_progress` and `bd ready` are only useful if the issue
        state is accurate. Many of these 173 issues are likely stale Choo Choo Ralph workflow
        issues from completed work that were never closed or whose dependencies were closed
        without closing the dependent.

        This task:
        1. Runs `bd orphans` to find issues with broken dependency chains
        2. Runs `bd stale` to find issues with no recent activity
        3. Closes or defers the stale/orphaned issues in batch
        4. Verifies `bd blocked` count drops significantly after cleanup

        Do NOT close issues that have legitimate blockers or are genuinely in-progress work.
        Focus on ccr-mol-* issues that are stuck in "Verify Implementation" or "Commit Changes"
        state with no recent activity (created 2026-04-29, never touched since).
      </description>
      <steps>
        - Run `bd orphans` — list all issues with broken dependency chains
        - Run `bd stale` — list all issues with no recent activity
        - Cross-reference: issues that are both orphaned AND stale are candidates for closing
        - For ccr-mol-* "Verify Implementation" and "Commit Changes" issues with no activity
          since 2026-04-29: close in batch with reason "stale — parent workflow completed"
        - Use `bd close <id1> <id2> ...` for batch closure (more efficient than one at a time)
        - Run `bd stats` before and after to capture the improvement
        - Run `bd blocked` after — confirm count dropped meaningfully
      </steps>
      <test_steps>
        1. Run `bd stats` — record baseline open/blocked counts
        2. Run `bd orphans` — confirm output is empty or near-empty after cleanup
        3. Run `bd blocked` — confirm count is significantly lower than 173
        4. Run `bd ready` — confirm it returns genuinely actionable issues (not noise)
        5. Run `bd list --status=in_progress` — confirm only truly active work appears
      </test_steps>
      <review></review>
    </task>

  </tasks>

  <success_criteria>
    - SessionStart hook pulls Dolt state and shows active sessions on every new session
    - Stop hook ensures beads state is published when any session terminates normally
    - pnpm install from a worktree path prints a visible warning
    - Current in-progress issue is labeled with wt:temporal-floating-lark
    - At least 5 multi-worktree rules are stored in bd memory and retrievable by keyword
    - CLAUDE.md has a dedicated Multi-Worktree Collaboration section with command examples
    - bd blocked count drops from 173 to under 20 (genuine blockers only)
    - bd ready returns actionable work without noise from stale workflow issues
  </success_criteria>

</project_specification>
