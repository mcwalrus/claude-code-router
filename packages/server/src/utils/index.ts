import fs from "node:fs/promises";
import readline from "node:readline";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import path from "node:path";
import {
  CONFIG_FILE_JSONC,
  EXAMPLE_CONFIG_CONTENT,
  resolveConfigFile,
  DEFAULT_CONFIG,
  HOME_DIR,
  PLUGINS_DIR,
  validateConfig,
  loadEnvConfig,
} from "@CCR/shared";

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
    const interpolated = interpolateEnvVars(parsedConfig);
    const validation = validateConfig(interpolated);
    if (!validation.valid) {
      console.warn(`Config validation warnings (${validation.errors.length} issue(s)):`);
      validation.errors.slice(0, 5).forEach((e) => console.warn(`  ${e}`));
      if (validation.errors.length > 5) {
        console.warn(`  ...and ${validation.errors.length - 5} more`);
      }
    }
    return interpolated;
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

/**
 * Merge JSON config with CCR_ prefixed env vars.
 * Env vars take precedence over JSON values.
 */
function mergeEnvConfig(config: any): any {
  if (!config || typeof config !== "object") {
    config = {};
  }
  const envConfig = loadEnvConfig();
  if (Object.keys(envConfig).length === 0) {
    return config;
  }
  // Deep merge: env overrides JSON, but preserves un-touched JSON structure
  return deepMerge(config, envConfig);
}

function deepMerge(target: any, source: any): any {
  if (source === null || source === undefined) return target;
  if (target === null || target === undefined) return source;

  if (Array.isArray(target) && Array.isArray(source)) {
    // For arrays, source entries override target entries by index (if present)
    const result = [...target];
    for (let i = 0; i < source.length; i++) {
      if (i < result.length) {
        result[i] = deepMerge(result[i], source[i]);
      } else {
        result.push(source[i]);
      }
    }
    return result;
  }

  if (typeof target === "object" && typeof source === "object" && !Array.isArray(source)) {
    const result = { ...target };
    for (const [key, val] of Object.entries(source)) {
      if (key in result) {
        result[key] = deepMerge(result[key], val);
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  // Primitives: source wins
  return source;
}

export const initConfig = async () => {
  const fileConfig = await readConfigFile();
  const merged = mergeEnvConfig(fileConfig);
  Object.assign(process.env, merged);
  return merged;
};
