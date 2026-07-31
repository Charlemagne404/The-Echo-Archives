#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

function fail(message) {
  throw new Error(message);
}

function orderedHandlers(routes, output = []) {
  for (const route of routes || []) {
    for (const handler of route.handle || []) {
      output.push({ handler, match: route.match || [] });
      if (handler.handler === "subroute") {
        orderedHandlers(handler.routes, output);
      }
    }
  }
  return output;
}

function routeForHost(server, host) {
  return (server.routes || []).find((route) =>
    (route.match || []).some((matcher) =>
      Array.isArray(matcher.host) && matcher.host.includes(host),
    ),
  );
}

function isPeerAbort(entry) {
  return entry.handler?.handler === "static_response" &&
    entry.handler?.abort === true &&
    entry.match.some((matcher) =>
      Array.isArray(matcher.not) && matcher.not.some((negated) =>
        Array.isArray(negated.remote_ip?.ranges) &&
        negated.remote_ip.ranges.length > 0,
      ),
    );
}

function validateSite(server, host, isTerminalHandler) {
  const siteRoute = routeForHost(server, host);
  if (!siteRoute) fail(`missing adapted site route for ${host}`);
  const handlers = orderedHandlers([siteRoute]);
  const abortIndexes = handlers
    .map((entry, index) => isPeerAbort(entry) ? index : -1)
    .filter((index) => index >= 0);
  if (abortIndexes.length !== 1) {
    fail(`${host} must contain exactly one negated remote_ip abort`);
  }
  const terminalIndex = handlers.findIndex(({ handler }) =>
    isTerminalHandler(handler),
  );
  if (terminalIndex < 0) fail(`missing terminal handler for ${host}`);
  if (abortIndexes[0] >= terminalIndex) {
    fail(`${host} peer abort is ordered after its terminal handler`);
  }
}

function validateAdaptedConfig(config) {
  const servers = Object.values(config?.apps?.http?.servers || {});
  const server = servers.find((candidate) =>
    routeForHost(candidate, "echoarchives.net") &&
    routeForHost(candidate, "www.echoarchives.net"),
  );
  if (!server) fail("Echo routes do not share an adapted HTTP server");

  if (
    server.trusted_proxies?.source !== "static" ||
    !Array.isArray(server.trusted_proxies?.ranges) ||
    server.trusted_proxies.ranges.length === 0 ||
    server.trusted_proxies_strict !== 1 ||
    server.strict_sni_host !== true ||
    JSON.stringify(server.client_ip_headers) !== JSON.stringify(["CF-Connecting-IP"])
  ) {
    fail("adapted server is missing strict Cloudflare client-IP semantics");
  }

  validateSite(
    server,
    "echoarchives.net",
    (handler) => handler.handler === "reverse_proxy" &&
      (handler.upstreams || []).some((upstream) => upstream.dial === "127.0.0.1:3010"),
  );
  validateSite(
    server,
    "www.echoarchives.net",
    (handler) => handler.handler === "static_response" &&
      handler.status_code === 301 &&
      (handler.headers?.Location || []).includes(
        "https://echoarchives.net{http.request.uri}",
      ),
  );
}

function adaptAndValidate(configPath, caddyBinary = "caddy") {
  const result = spawnSync(
    caddyBinary,
    ["adapt", "--config", configPath, "--adapter", "caddyfile"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "Caddy adaptation failed.\n");
    process.exitCode = result.status || 1;
    return;
  }
  validateAdaptedConfig(JSON.parse(result.stdout));
  process.stdout.write(
    `Validated Caddy origin semantics: ${path.resolve(configPath)}\n`,
  );
}

if (require.main === module) {
  const configPath = process.argv[2];
  if (!configPath || process.argv.length > 4) {
    process.stderr.write(
      "Usage: node validate-caddy-origin-semantics.js CADDYFILE [CADDY_BINARY]\n",
    );
    process.exit(2);
  }
  try {
    adaptAndValidate(configPath, process.argv[3]);
  } catch (error) {
    process.stderr.write(`Caddy origin semantic validation failed: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { orderedHandlers, validateAdaptedConfig };
