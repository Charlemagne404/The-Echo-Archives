# Entity attribution enrichment

`npm run report:entity-attribution` inspects published show records, public entities, explicit credits, legacy attribution fields, import provenance, and catalogue URLs using repository data only.

The command is report-only by default. Use `--json` for the complete ranked review queue, including:

- the show and source path;
- an existing candidate entity when one matches, or an explicit unresolved raw value when none does;
- the proposed relationship role;
- exact source evidence, stored import provenance, and repository-held URLs; and
- confidence plus the reason automatic linking was withheld.

The only automatic rule currently enabled is an exact, non-compound match in `credits.network`, `credits.productionCompany`, or `credits.studio` where the public entity type agrees with the proposed role. Ambiguous names, aliases with multiple matches, compound values, legacy IDs, creator strings, owner/provider credits, and entity-type conflicts remain review-only. The tool never creates entities and never performs external lookups.

After reviewing the plan, `npm run report:entity-attribution -- --apply` writes only the deterministic `entityLinks` additions to `catalog-src/shows`. Re-run `npm run build:catalog` and `npm run build:pages` after applying source changes.
