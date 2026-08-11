# Caddy and Ollama controlled upgrades

Run these as two separate maintenance events. A successful component is fully
verified before the next begins. The versions reviewed on 2026-07-28 are Caddy
`2.11.4` and Ollama `0.32.5`.

## Shared rules

- Start only after a fresh verified Echo SQLite backup.
- Preserve the current binary/package, configuration, unit, and version output.
- Keep all downloaded artifacts and rollback copies root-only.
- Never print environment files, model data, or monitoring credentials.
- Stop on a failed checksum, configuration validation, service state, bind
  check, or health check.
- Do not change firewall, DNS, TLS policy, or unrelated service configuration.

## Caddy 2.11.4

Official amd64 package SHA-512:

```text
1c6f5404f3622e46d401d81f4af59677d46b886229c6694d60fd936b87c72d3bb5d1fcf42b55c8d555769fa75acf434ab618fc7e0df2c79cf8512ee580d38d06
```

Rollback package `2.10.2` SHA-512:

```text
e3d6909253b12dc723393fb1f0ace74e2c9bd8d64273fca6727adcf7c7882ebcb9611b6ab42223b20e93fc702f7c0f25bff1c12a88223202a069bb770d95990d
```

Download both `.deb` files from their matching official GitHub release URLs,
verify the exact filenames against the published checksum files, and preserve
the live Caddyfile and systemd unit. Before installation:

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl status caddy --no-pager
```

Install only the reviewed package while retaining the existing conffile:

```bash
sudo env DEBIAN_FRONTEND=noninteractive \
  dpkg --force-confold --install /path/to/caddy_2.11.4_linux_amd64.deb
caddy version
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

The package operation may already reload Caddy; a further validated reload is
safe and preferred to a restart. Verify apex/public health, both redirects,
certificates, the local Echo upstream, and every unrelated shared-host route.

Rollback:

```bash
sudo env DEBIAN_FRONTEND=noninteractive \
  dpkg --force-confold --install /path/to/caddy_2.10.2_linux_amd64.deb
sudo install -m 0644 /path/to/preserved/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

## Ollama 0.32.5

Official amd64 archive SHA-256:

```text
f7d6bdbcf71b83aa8670c4e7dc4b6936c0952fcf8b114eaf6a11cbadb9684214  ollama-linux-amd64.tar.zst
```

Preserve `/usr/local/bin/ollama`, `/usr/local/lib/ollama`, the unit, and the
current version before installing. Models live separately and must not be
deleted, moved, or re-pulled during the binary upgrade.

Download the archive from the official `v0.32.5` GitHub release, verify its
checksum, extract it into a new root-only staging directory, and inspect that
the staged tree contains `bin/ollama` and `lib/ollama/`. Then:

```bash
sudo systemctl stop ollama.service
sudo mv /usr/local/lib/ollama /path/to/rollback/ollama-lib.previous
sudo install -m 0755 /path/to/stage/bin/ollama /usr/local/bin/ollama
sudo install -d -m 0755 /usr/local/lib/ollama
sudo cp --archive --no-dereference /path/to/stage/lib/ollama/. /usr/local/lib/ollama/
sudo test -x /usr/local/lib/ollama/llama-server
sudo systemctl start ollama.service
```

Require all of:

```bash
ollama --version
systemctl is-active ollama.service
ss -ltn | grep -F '127.0.0.1:11434'
curl --fail --silent --show-error http://127.0.0.1:11434/api/tags
```

Run one short direct generation with the already-installed `mistral` model.
Then retest Echo's Ask-the-Archivist success, timeout, and fallback behavior
without submitting or changing real user/community records. Confirm no Caddy
route exposes port 11434 or Ollama API paths.

Rollback:

```bash
sudo systemctl stop ollama.service
sudo mv /usr/local/lib/ollama /path/to/rollback/ollama-lib.failed
sudo install -m 0755 /path/to/rollback/ollama.previous /usr/local/bin/ollama
sudo mv /path/to/rollback/ollama-lib.previous /usr/local/lib/ollama
sudo systemctl start ollama.service
```

After rollback, require the old version, loopback-only bind, direct generation,
and Echo fallback tests to pass before closing the incident.
