const test = require("node:test");
const assert = require("node:assert/strict");

const { assertNativeRuntime } = require("../lib/store/native-runtime");

test("SQLite native runtime accepts Node-API 10", () => {
  assert.doesNotThrow(() => assertNativeRuntime({ napiVersion: "10", nodeVersion: "v22.14.0" }));
});

test("SQLite native runtime rejects older Node-API before loading the addon", () => {
  assert.throws(
    () => assertNativeRuntime({ napiVersion: "9", nodeVersion: "v22.12.0" }),
    /better-sqlite3 13 native binding requires Node-API 10 or newer.*v22\.12\.0 provides Node-API 9/,
  );
});
