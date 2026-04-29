import type { ChildProcess } from "node:child_process";

export const EXIT_OK = 0;
export const EXIT_USER_ERROR = 1;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_SERVICE_ERROR = 3;
export const EXIT_SYSTEM_ERROR = 4;

export const RESET = "\x1B[0m";
export const BOLD = "\x1B[1m";
export const DIM = "\x1B[2m";
export const RED = "\x1B[31m";
export const YELLOW = "\x1B[33m";
export const CYAN = "\x1B[36m";

export type ErrorCategory = "user" | "config" | "service" | "system";

export function printError(
  category: ErrorCategory,
  message: string,
  hint?: string
): void {
  const label = category.toUpperCase();
  process.stderr.write(`\n  ${RED}✗${RESET} ${BOLD}[${label}]${RESET} ${message}\n`);
  if (hint) {
    process.stderr.write(`    ${DIM}→ ${hint}${RESET}\n`);
  }
  process.stderr.write("\n");
}

export function attachSpawnErrorHandler(
  proc: ChildProcess,
  label: string,
  options?: { hint?: string; onError?: () => void }
): void {
  proc.on("error", () => {
    options?.onError?.();
    printError(
      "system",
      `Failed to start ${label}`,
      options?.hint ?? "Check logs at ~/.claude-code-router/logs/"
    );
    process.exit(EXIT_SYSTEM_ERROR);
  });
}
