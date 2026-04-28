import { createEnvVariables } from "./createEnvVariables";
import { writeShellConfig } from "./writeShellConfig";

export const activateCommand = async (args: string[] = []) => {
  const envVars = await createEnvVariables();

  if (args.includes("--write")) {
    await writeShellConfig(envVars);
    return;
  }

  // Default: print exports to stdout for eval
  for (const [key, value] of Object.entries(envVars)) {
    if (value === "") {
      console.log(`export ${key}=""`);
    } else if (value === undefined) {
      console.log(`unset ${key}`);
    } else {
      console.log(`export ${key}="${value}"`);
    }
  }
};
