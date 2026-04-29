#!/usr/bin/env bash
set -e

claude --dangerously-skip-permissions --output-format stream-json --verbose -p "
You are running inside a Choo Choo Ralph workflow. Do not ask for confirmation.

## GOAL

Get \`gascity-runner\` running on a docker image end-to-end using the tech-stack provided.

## REPOS

 * gascity-runner = repo with docker image, ignore terraform.
 * claude-code-mcp = used in gascity-runner for agent-to-agent communication between containers.
 * claude-code-router = used to run in gascity-runner, should be setup as a hop-proxy to claude-code-router running locally.
 * llms = a dependency of claude-code-router which can be improved for claude-code-router ergenomics.

## INSTRUCTIONS

For this task, we need to figure out the safest path to employing the ccr claude-code-router setup locally.
Previously I had this running out of a docker image, however this is in a broken state.
Consider if running as a service via ccr start is a viable option.
Use /criticial-path-theory to guide your thinking.

Process repos in dependency order. Stop after all specs are poured." 2>&1 | "$(dirname "$0")/ralph-format.sh" $VERBOSE_FLAG || true