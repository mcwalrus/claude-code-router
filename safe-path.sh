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

I want you to figure out the safest path to running ccr locally as the proxy on the same port the docker image proxy (from just local-proxy). This needs to be done safely as to not take done the local-proxy docker service.

1. Read the codebase enough to understand what the goal requires.
2. Write a plan file at \`plans/<goal-name>.md\` scoped to that repo.
3. Run \`/choo-choo-ralph:spec plans/<goal-name>.md <goal-name>\` — review and resolve all \`<review>\` tags autonomously.
4. Run \`/choo-choo-ralph:pour <goal-name> choo-choo-ralph\`.

Process repos in dependency order. Stop after all specs are poured." 2>&1 | "$(dirname "$0")/ralph-format.sh" $VERBOSE_FLAG || true