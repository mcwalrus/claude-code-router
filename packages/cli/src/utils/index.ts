import fs from "node:fs/promises";
import readline from "node:readline";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import path from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import {
  CONFIG_FILE_JSONC,
  EXAMPLE_CONFIG_CONTENT,
  resolveConfigFile,
  HOME_DIR, PID_FILE,
  PLUGINS_DIR,
  PRESETS_DIR,
  REFERENCE_COUNT_FILE,
  readPresetFile,
} from "@CCR/shared";
import { getServer } from "@CCR/server";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { checkForUpdates, performUpdate } from "./update";
import { version } from "../../package.json";
import { spawn } from "child_process";
import {cleanupPidFile, isServiceRunning} from "./processCheck";
import { attachSpawnErrorHandler } from "./errors";

// Function to interpolate environment variables in config values
const interpolateEnvVars = (obj: any): any => {
  if (typeof obj === "string") {
    // Replace $VAR_NAME or ${VAR_NAME} with environment variable values
    return obj.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, unbraced) => {
      const varName = braced || unbraced;
      return process.env[varName] || match; // Keep original if env var doesn't exist
    });
  } else if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  } else if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
    }
    return result;
  }
  return obj;
};

const ensureDir = async (dir_path: string) => {
  try {
    await fs.access(dir_path);
  } catch {
    await fs.mkdir(dir_path, { recursive: true });
  }
};

export const initDir = async () => {
  await ensureDir(HOME_DIR);
  await ensureDir(PLUGINS_DIR);
  await ensureDir(PRESETS_DIR);
  await ensureDir(path.join(HOME_DIR, "logs"));
};

const createReadline = () => {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
};

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    const rl = createReadline();
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

const confirm = async (query: string): Promise<boolean> => {
  const answer = await question(query);
  return answer.toLowerCase() !== "n";
};

export const readConfigFile = async () => {
  let configPath: string;
  try {
    configPath = await resolveConfigFile();
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
    return;
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const errors: ParseError[] = [];
    const parsedConfig = parseJsonc(content, errors);
    if (errors.length > 0) {
      console.error(`Failed to parse config file at ${configPath}`);
      errors.slice(0, 5).forEach((e) => console.error(`  offset ${e.offset}: error code ${e.error}`));
      process.exit(1);
    }
    return interpolateEnvVars(parsedConfig);
  } catch (readError: any) {
    if (readError.code === "ENOENT") {
      try {
        await initDir();
        await fs.writeFile(CONFIG_FILE_JSONC, EXAMPLE_CONFIG_CONTENT);
        console.log("Copied example configuration to ~/.claude-code-router/config.jsonc");
        console.log("Please edit this file with your actual configuration.");
        const errors: ParseError[] = [];
        const parsed = parseJsonc(EXAMPLE_CONFIG_CONTENT, errors);
        return interpolateEnvVars(parsed ?? {});
      } catch (error: any) {
        console.error("Failed to create default configuration:", error.message);
        process.exit(1);
      }
    } else {
      console.error(`Failed to read config file at ${configPath!}`);
      console.error("Error details:", readError.message);
      process.exit(1);
    }
  }
};

export const backupConfigFile = async () => {
  try {
    const configPath = await resolveConfigFile().catch(() => null);
    if (!configPath) return null;
    if (!await fs.access(configPath).then(() => true).catch(() => false)) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.${timestamp}.bak`;
    await fs.copyFile(configPath, backupPath);

    try {
      const configDir = path.dirname(configPath);
      const configFileName = path.basename(configPath);
      const files = await fs.readdir(configDir);
      const backupFiles = files
        .filter(file => file.startsWith(configFileName) && file.endsWith('.bak'))
        .sort()
        .reverse();
      if (backupFiles.length > 3) {
        for (let i = 3; i < backupFiles.length; i++) {
          await fs.unlink(path.join(configDir, backupFiles[i]));
        }
      }
    } catch (cleanupError) {
      console.warn("Failed to clean up old backups:", cleanupError);
    }

    return backupPath;
  } catch (error) {
    console.error("Failed to backup config file:", error);
  }
  return null;
};

export const writeConfigFile = async (config: any) => {
  await ensureDir(HOME_DIR);
  const configPath = await resolveConfigFile().catch(() => CONFIG_FILE_JSONC);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
};

export const initConfig = async () => {
  const config = await readConfigFile();
  Object.assign(process.env, config);
  return config;
};

export const run = async (args: string[] = []) => {
  const isRunning = isServiceRunning()
  if (isRunning) {
    console.log('claude-code-router server is running');
    return;
  }
  const server = await getServer();
  const app = server.app;
  // Save the PID of the background process
  writeFileSync(PID_FILE, process.pid.toString());

  app.post('/api/update/perform', async () => {
    return await performUpdate();
  })

  app.get('/api/update/check', async () => {
    return await checkForUpdates(version);
  })

  app.post("/api/restart", async () => {
    setTimeout(async () => {
      spawn("ccr", ["restart"], {
        detached: true,
        stdio: "ignore",
      }).unref();
    }, 100);

    return { success: true, message: "Service restart initiated" }
  });

  // await server.start() to ensure it starts successfully and keep process alive
  await server.start();
}

export const restartService = async () => {
  // Stop the service if it's running
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
    process.kill(pid);
    cleanupPidFile();
    if (existsSync(REFERENCE_COUNT_FILE)) {
      try {
        await fs.unlink(REFERENCE_COUNT_FILE);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    console.log("claude code router service has been stopped.");
  } catch (e) {
    console.log("Service was not running or failed to stop.");
    cleanupPidFile();
  }

  // Start the service again in the background
  console.log("Starting claude code router service...");
  const cliPath = path.join(__dirname, "cli.js");
  const startProcess = spawn("node", [cliPath, "start", "--foreground"], {
    detached: true,
    stdio: "ignore",
  });

  attachSpawnErrorHandler(startProcess, "CCR server");

  startProcess.unref();
  console.log("✅ Service started successfully in the background.");
};


/**
 * Get a temporary path for the settings file
 * Hash the content and return the file path if it already exists in temp directory,
 * otherwise create a new file with the content
 * @param content Settings content string
 * @returns Full path to the temporary file
 */
export const getSettingsPath = async (content: string): Promise<string> => {
  // Hash the content using SHA256 algorithm
  const hash = createHash('sha256').update(content, 'utf-8').digest('hex');

  // Create claude-code-router directory in system temp folder
  const tempDir = path.join(os.tmpdir(), 'claude-code-router');
  const fileName = `ccr-settings-${hash}.json`;
  const tempFilePath = path.join(tempDir, fileName);

  // Ensure the directory exists
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir, { recursive: true });
  }

  // Check if the file already exists
  try {
    await fs.access(tempFilePath);
    return tempFilePath;
  } catch {
    // File doesn't exist, create and write content
    await fs.writeFile(tempFilePath, content, 'utf-8');
    return tempFilePath;
  }
}
