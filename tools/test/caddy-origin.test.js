const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  validateAdaptedConfig,
} = require("../../deploy/validate-caddy-origin-semantics.js");

const ROOT = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Caddy origin candidate tooling is guarded and documents rollback", () => {
  const scriptPath = path.join(ROOT, "deploy/prepare-caddy-origin-candidate.sh");
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);

  const script = read("deploy/prepare-caddy-origin-candidate.sh");
  assert.match(script, /refusing to overwrite existing candidate/);
  assert.match(script, /already has global options/);
  assert.match(script, /caddy validate --config/);
  assert.doesNotMatch(script, /caddy fmt/, "Unrelated shared-host blocks must not be reformatted.");
  assert.match(script, /Caddyfile\.global\.echo/);
  assert.match(script, /Caddyfile\.echo/);
  assert.match(script, /validate-caddy-origin-semantics\.js/);

  const siteSnippet = read("deploy/Caddyfile.echo");
  assert.match(
    siteSnippet,
    /route \{[\s\S]{0,300}abort @not_cloudflare[\s\S]{0,300}reverse_proxy 127\.0\.0\.1:3010/,
  );
  assert.match(
    siteSnippet,
    /www\.echoarchives\.net \{[\s\S]{0,800}route \{[\s\S]{0,120}abort @not_cloudflare[\s\S]{0,120}redir https:\/\/echoarchives\.net/,
  );

  const runbook = read("deploy/CADDY_ORIGIN_RUNBOOK.md");
  assert.match(runbook, /systemctl reload caddy/);
  assert.match(runbook, /preserved\/Caddyfile/);
  assert.match(runbook, /direct IP access/);
  assert.match(runbook, /two external clients/);
  assert.match(runbook, /unrelated shared-host service/);
});

function adaptedConfig({ originAbortFirst = true } = {}) {
  const abortRoute = {
    match: [{ not: [{ remote_ip: { ranges: ["173.245.48.0/20"] } }] }],
    handle: [{ handler: "static_response", abort: true }],
  };
  const proxyRoute = {
    handle: [{
      handler: "reverse_proxy",
      upstreams: [{ dial: "127.0.0.1:3010" }],
    }],
  };
  const redirectRoute = {
    handle: [{
      handler: "static_response",
      status_code: 301,
      headers: { Location: ["https://echoarchives.net{http.request.uri}"] },
    }],
  };
  const siteRoute = (host, routes) => ({
    match: [{ host: [host] }],
    handle: [{ handler: "subroute", routes }],
  });
  return {
    apps: {
      http: {
        servers: {
          srv0: {
            trusted_proxies: {
              source: "static",
              ranges: ["173.245.48.0/20"],
            },
            trusted_proxies_strict: 1,
            strict_sni_host: true,
            client_ip_headers: ["CF-Connecting-IP"],
            routes: [
              siteRoute(
                "echoarchives.net",
                originAbortFirst
                  ? [abortRoute, proxyRoute]
                  : [proxyRoute, abortRoute],
              ),
              siteRoute("www.echoarchives.net", [abortRoute, redirectRoute]),
            ],
          },
        },
      },
    },
  };
}

test("adapted Caddy semantics require the peer abort before terminal handlers", () => {
  assert.doesNotThrow(() => validateAdaptedConfig(adaptedConfig()));
  assert.throws(
    () => validateAdaptedConfig(adaptedConfig({ originAbortFirst: false })),
    /peer abort is ordered after its terminal handler/,
  );
});
