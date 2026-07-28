const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_ROOT = path.join(ROOT, "backend");
const ENV_PATH = path.join(BACKEND_ROOT, ".env");

function loadBackendEnvironment() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  if (typeof process.loadEnvFile !== "function") {
    throw new Error("Loading backend/.env requires Node 22.12 or newer.");
  }

  process.loadEnvFile(ENV_PATH);
}

function resolveCommand(argv) {
  const supportedArguments = new Set(["--check-config", "--watch"]);
  const unknownArgument = argv.find((argument) => !supportedArguments.has(argument));
  if (unknownArgument) {
    throw new Error(`Unknown backend runner argument: ${unknownArgument}`);
  }

  if (argv.length > 1) {
    throw new Error("Use only one backend runner mode at a time.");
  }

  if (argv.includes("--check-config")) {
    return [path.join("scripts", "check-config.js")];
  }

  if (argv.includes("--watch")) {
    return ["--watch", "server.js"];
  }

  return ["server.js"];
}

function main() {
  loadBackendEnvironment();

  const child = spawn(process.execPath, resolveCommand(process.argv.slice(2)), {
    cwd: BACKEND_ROOT,
    env: process.env,
    stdio: "inherit",
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  child.once("error", (error) => {
    console.error(`Unable to start the backend: ${error.message}`);
    process.exitCode = 1;
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = Number.isInteger(code) ? code : 1;
  });
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
