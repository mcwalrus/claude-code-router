import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Must match the marker used in scripts/shell-setup.sh so both tools are idempotent.
const MARKER = "# CCR: Claude Code Router local proxy";

function buildBlock(vars: Record<string, string | undefined>): string {
  const lines = [MARKER];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      lines.push(`unset ${key}`);
    } else {
      lines.push(`export ${key}="${value}"`);
    }
  }
  return lines.join("\n");
}

async function candidateRcFiles(): Promise<string[]> {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".zshrc"),
    path.join(home, ".bashrc"),
    path.join(home, ".bash_profile"),
  ];
  const results: string[] = [];
  for (const f of candidates) {
    try {
      await fs.access(f);
      // Include .bash_profile only when .bashrc is absent (macOS bash pattern)
      if (f.endsWith(".bash_profile") && results.some((r) => r.endsWith(".bashrc"))) {
        continue;
      }
      results.push(f);
    } catch {
      // file doesn't exist
    }
  }
  // Fall back to creating ~/.zshrc (macOS default shell, new user)
  if (results.length === 0) {
    const zshrc = path.join(home, ".zshrc");
    await fs.writeFile(zshrc, "", { flag: "a" });
    results.push(zshrc);
  }
  return results;
}

export async function writeShellConfig(
  vars: Record<string, string | undefined>
): Promise<void> {
  const block = buildBlock(vars);
  const rcFiles = await candidateRcFiles();

  let written = 0;
  for (const rc of rcFiles) {
    const content = await fs.readFile(rc, "utf-8").catch(() => "");
    if (content.includes(MARKER)) {
      console.log(`Already configured in ${path.basename(rc)} — skipping.`);
      continue;
    }
    await fs.appendFile(rc, `\n${block}\n`);
    console.log(`✓ Added proxy config to ${rc}`);
    written++;
  }

  console.log();
  if (written > 0) {
    const baseUrl = vars.ANTHROPIC_BASE_URL ?? "http://127.0.0.1:3456";
    console.log(`Done. Future shell sessions will route Claude Code through ${baseUrl}`);
    console.log();
    console.log("Apply to the current session:");
    rcFiles.forEach((rc) => console.log(`  source ${rc}`));
  } else {
    console.log("No changes — all shell configs were already up to date.");
  }
}
