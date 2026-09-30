const REQUIRED_NAPI_VERSION = 10;

function assertNativeRuntime({ napiVersion = process.versions.napi, nodeVersion = process.version } = {}) {
  const napi = Number(napiVersion);
  if (Number.isFinite(napi) && napi >= REQUIRED_NAPI_VERSION) {
    return;
  }

  const availableApi = Number.isFinite(napi) ? `Node-API ${napi}` : "no Node-API version";
  throw new Error(
    `The better-sqlite3 13 native binding requires Node-API ${REQUIRED_NAPI_VERSION} or newer; `
      + `${nodeVersion} provides ${availableApi}. Use Node.js 22.14+ or another supported release with Node-API 10+.`,
  );
}

module.exports = { assertNativeRuntime };
