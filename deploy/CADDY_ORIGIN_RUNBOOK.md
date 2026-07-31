# Echo Caddy origin and client-IP change

This change must be performed in its own maintenance step. It protects only
`echoarchives.net` and `www.echoarchives.net`; the DNS-only legacy Continental
redirect remains directly reachable. It does not alter unrelated site blocks.

## Prepared state

1. Make a root-only copy of `/etc/caddy/Caddyfile`.
2. Build a complete shared-host candidate without overwriting either source:

   ```bash
   ./deploy/prepare-caddy-origin-candidate.sh \
     /etc/caddy/Caddyfile \
     /home/charlie/.local/state/echo-archives-rollbacks/Caddyfile.candidate
   ```

3. Review the full diff. The only intended changes are:
   - the one leading global options block from `Caddyfile.global.echo`;
   - replacement of the three Echo site blocks from `Caddyfile.echo`.
4. Run syntax and adapted-handler semantic validation against the candidate:

   ```bash
   caddy validate --config /path/to/Caddyfile.candidate --adapter caddyfile
   node ./deploy/validate-caddy-origin-semantics.js \
     /path/to/Caddyfile.candidate "$(command -v caddy)"
   ```

   The semantic check requires each negated `remote_ip` abort to precede its
   reverse-proxy or redirect handler after Caddy adapts the file. Keeping those
   handlers inside one `route` block prevents normal directive sorting from
   moving the terminal handler ahead of the origin gate.
5. Confirm the checked-in Cloudflare networks still match the official
   `ips-v4` and `ips-v6` lists using:

   ```bash
   ./deploy/check-cloudflare-proxy-ranges.sh --confirm-network
   ```

## Apply

The elevated operator must replace the live Caddyfile using `install`, validate
the installed file, and use `systemctl reload caddy`. A reload is sufficient;
do not restart Caddy for this configuration-only change.

Stop immediately if validation or reload fails. Do not continue into another
maintenance component.

## Rollback

Use the exact preserved Caddyfile, validate it before installing it, then
reload:

```bash
sudo caddy validate --config /path/to/preserved/Caddyfile --adapter caddyfile
sudo install -m 0644 /path/to/preserved/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

After apply or rollback, verify all shared-host routes, not only Echo.

## Required external checks

- Cloudflare apex health and homepage remain successful.
- `www` still permanently redirects with path/query preserved.
- the legacy DNS-only hostname still redirects.
- direct IP access with Echo SNI/Host fails.
- spoofed `X-Forwarded-For` and `CF-Connecting-IP` do not bypass the peer gate.
- two external clients reach Express as distinct client identities.
- certificate renewal paths and every unrelated shared-host service remain
  healthy.
