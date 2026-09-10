const { spawnSync } = require("node:child_process");

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node run-with-env.js <command> [args…]");
  process.exit(2);
}

const result = spawnSync(command, args, {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to run ${command}: ${result.error.message}`);
  process.exit(1);
}

process.exit(typeof result.status === "number" ? result.status : 1);
