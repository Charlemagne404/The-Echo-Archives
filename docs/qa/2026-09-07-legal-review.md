# Proportionate legal-readiness review — 2026-09-08

## Status

This is a repository and public-deployment legal-readiness review, not legal advice, a controller determination, or a certification that the service has no legal issues. It assesses the small Sweden-based Echo Archives as it exists today: an editorial audio-drama catalogue with limited, ancillary community ratings, reviews, corrections, and submissions.

The review does not assume that obligations designed for a large commercial marketplace, a high-volume social network, or a paid e-commerce service automatically apply. A missing fact is recorded as a conditional follow-up rather than promoted to a deployment blocker without a concrete legal reason.

## Executive outcome

There is one confirmed deployment blocker:

- **Production parity:** the public site still exposes `v1.0.2` and August 20, 2026 legal pages, while this worktree contains the September 8, 2026 legal copy and acknowledgement version. The current legal review cannot be represented as the live site until the reviewed release is deployed and rechecked.

No residential address, organisation number, VAT number, DPO identity, or EU representative has been invented or added. On the current processing facts, a DPO is not required under GDPR Article 37, and an EU representative is not required because the operator is established in Sweden. The current rating storage has a reasonable technical-necessity basis for the requested feature, so a site-wide optional-cookie banner is not required by the implementation reviewed here.

## Scope and evidence

Reviewed on September 8, 2026:

- source legal pages under `site-src/pages/` and generated root/clean-route copies;
- browser submission acknowledgement in `shared/app/submit/api.js`;
- server acknowledgement validation in `backend/lib/services/submission-service.js`;
- submission retention, community-rating, and security-related storage behavior;
- catalogue schema and importer source evidence;
- Cloudflare references and repository/deployment configuration visible without secrets;
- focused tests, data validation, and the public deployment at [echoarchives.net](https://echoarchives.net/).

The public checks found `v1.0.2` on the home page and on the legal pages. The live `/privacy`, `/terms`, `/cookies`, and `/copyright` pages still say “August 20, 2026”. The live `/privacy` page still contains the superseded RUM wording; this is part of the same deployment-parity blocker, not evidence that the current worktree wording is live.

Primary references:

- [GDPR, Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), especially Articles 13, 27, 28, 32–34, and 37;
- [IMY guidance on data protection officers](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/dataskyddsombud/om-dataskyddsombud-i-dataskyddsforordningen/);
- [Swedish Electronic Commerce Act, section 8 and definitions](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2002562-om-elektronisk-handel-och-andra_sfs-2002-562/);
- [PTS guidance on cookies](https://pts.se/internet-och-telefoni/kakor-cookies/);
- [Digital Services Act, Regulation (EU) 2022/2065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065);
- [IMY GDPR complaint route](https://www.imy.se/en/individuals/forms-and-e-services/file-a-gdpr-complaint/?epslanguage=en).

## Classification method

| Bucket | Meaning in this review |
| --- | --- |
| **Clearly applicable** | The current service actually processes the relevant data or performs the relevant activity, so the associated obligation should be implemented now. |
| **Conditional / probably not applicable** | The obligation depends on facts not established here, such as remuneration, operator size, a materially different audience, or a change in processing. It is documented without blocking deployment by default. |
| **Best practice** | A sensible control that improves accuracy, accountability, or rights handling but is not itself a demonstrated statutory launch condition for this small service. |
| **Speculative / not a blocker** | A possibility without current factual evidence or a concrete legal trigger. It should not be used to demand a large system or hold deployment. |

## Clearly applicable baseline

The following baseline duties are not treated as optional merely because Echo is small:

- GDPR applies to the personal data actually processed by the Swedish operator, including contact emails, request IP/user-agent data, pseudonymous rating identifiers, and moderation/submission records. The public notice should identify the controller, purposes, legal bases, categories, retention, recipients/providers, rights, and complaint route; the current source pages cover these categories and are being kept aligned with the implementation.
- Where a provider processes personal data on Echo’s behalf, the controller needs an appropriate processor arrangement and must apply risk-appropriate security, access, restoration, retention, and breach-response controls. Those duties do not require Echo to publish unverified infrastructure details as facts.
- Swedish electronic-communications/cookie rules apply to storage access questions. The current first-party storage is documented and purpose-limited; whether consent is needed depends on the storage’s actual purpose and timing, not on a blanket assumption that every browser key requires a banner.
- Copyright, attribution, and rights-holder correction/removal concerns apply to third-party artwork, logos, descriptions, names, and other material Echo chooses to reproduce or serve locally. Provenance and a practical notice route reduce risk but do not create permission or a licence.

## CRITICAL — concrete issue that should realistically block deployment

### C1. Live legal surfaces are older than the reviewed repository

The production site currently serves `v1.0.2` and August 20, 2026 legal copy. The reviewed worktree contains `v1.1.2` generated pages, September 8, 2026 source legal pages, corrected provider wording, direct IMY information, and the current acknowledgement version. A privacy notice that does not match the live processing and an acknowledgement flow that is newer only in source are concrete transparency and release-control problems.

This is the only confirmed legal-readiness deployment blocker from the evidence available. It is not resolved by local tests. The reviewed release still needs an authorised deployment, followed by live checks of `/privacy`, `/terms`, `/cookies`, `/copyright`, the footer version, and the submission acknowledgement path.

## IMPORTANT — should be fixed but does not necessarily block deployment

### I1. Catalogue provenance and third-party content rights

Echo serves third-party show names, cover artwork, logos, descriptions, links, and related metadata. Copyright and attribution risk is real even though Echo is an index rather than an audio host. The existing [Copyright & Takedown](/copyright) page is a useful voluntary correction/removal route, but a source URL alone does not prove a licence or permission.

The repository now has a small optional `provenance` shape for source records, including:

- source URL and source type;
- description origin and description source URLs;
- artwork source and optional rights note;
- logo sources and optional rights notes;
- a general rights-tracking note.

Importer-created records will map existing field-level source evidence into that shape. Existing records are not deleted or mass-rewritten: the current report identifies all 752 as legacy/unknown at the new top-level, while preserving their existing objective/import source evidence. This is an appropriate staged control, not a claim that all current artwork or copy is licensed.

The notice route explicitly accepts correction or removal requests for artwork, logos, descriptions, catalogue records, ratings, and reviews. A rightsholder can provide the exact page or asset URL, the concern, requested action, supporting evidence, and a reply address.

### I2. Production provider and retention evidence should be completed

The following GDPR controls clearly matter if the corresponding services are used:

- identify controller/processor or independent-provider roles accurately;
- keep an Article 28 processor agreement and service configuration where a provider processes information on Echo’s behalf;
- document purposes, categories, recipients, retention, rights, and relevant international-transfer safeguards;
- use risk-appropriate security, restoration, access control, retention, and breach-response procedures;
- keep the public notice aligned with enabled services.

Cloudflare is now described as an edge delivery/security provider and, **where it processes information on the controller’s behalf**, a processor or service provider under the applicable customer terms and data-processing agreement. Some Cloudflare services can have their own provider role or terms. The repository does not assert a fixed RUM dataset, retention period, cookie/local-storage behavior, or identity outcome.

Production account settings, host logs, enabled Turnstile/RUM services, provider terms, and backup access should still be checked by the operator. Unknown physical backup regions or an unverified provider setting are not, by themselves, a concrete legal breach or a reason to require a deployment stop. If an actual configuration shows an unprotected third-country transfer, an undisclosed processor, or retention inconsistent with the notice, that concrete fact should be reclassified and fixed before relying on the affected service.

### I3. Simple user-content notice handling should remain available

Reviews and any future free-text submissions can be “information provided by recipients” even though community content is ancillary to the editorial catalogue. The DSA may therefore be relevant to the provider classification and to hosting user content. Echo is very small and there is no evidence here of a very large online platform, systemic-risk service, or commercial marketplace.

The current [Copyright & Takedown](/copyright) route is a proportionate control: it is electronic, asks for the exact page or asset URL and a reason, accepts evidence and contact details, and records that the archive may restrict, hide, correct, or remove material. Terms state that any mandatory process takes priority. This should be kept and used consistently; it does not justify building a large appeals, trusted-flagger, out-of-court, or algorithmic-moderation system on the current facts.

## FOLLOW-UP — legal or technical assessment worth documenting

### F1. DPO: not required under current processing; reassess if processing materially changes

GDPR Article 37 requires a DPO for a public authority/body, core activities involving regular and systematic monitoring of people on a **large scale**, or core activities involving large-scale special-category or criminal-offence data. IMY’s guidance similarly distinguishes core activity from support processing and gives scale-sensitive examples.

The current Echo facts do not show any of those triggers: the operator is not a public authority; the core activity is a small editorial catalogue; community ratings/submissions are limited and ancillary; and there is no identified large-scale special-category or criminal-offence processing. The DPO item is therefore **not required under current processing; reassess if processing materially changes**. A DPO may still be appointed voluntarily, but no DPO identity needs to be invented or published now.

### F2. Swedish operator address and the Electronic Commerce Act

The Swedish Electronic Commerce Act’s section 8 address disclosure applies to an “information society service” covered by the Act; the Act’s definition is tied to a service normally provided for remuneration. Echo, as currently evidenced, is a free editorial catalogue/community project with no Echo checkout, subscription, or direct paid service shown. External links to listening platforms or voluntary support destinations do not by themselves establish that Echo is a paid service.

The requirement is therefore unresolved and conditional, not a demonstrated current blocker. If the actual operator model makes section 8 applicable, it calls for the operator’s name, address, and email, with organisation/VAT information only where applicable. No private residential address should be added automatically. The operator must decide whether an approved service/contact address is available if the Act applies; no organisation number, VAT number, business address, or other registration detail should be invented.

GDPR transparency still requires a clear controller identity and contact method, which the current pages provide through the named Swedish operator and privacy email. The section 8 address question is the one genuinely fact-sensitive operator-disclosure issue that may justify targeted Swedish legal advice if a definitive conclusion is needed; it is not a reason to publish a home address by default.

### F3. DSA scope at Echo’s present scale

The DSA can cover intermediary services offered in the EU. Hosting services may include storing and disseminating information supplied by users, and an online-platform classification can depend on how public user content is stored and distributed. Listener reviews are the clearest example; numeric ratings may be simpler signals rather than a substantial public-content service. Echo’s editorial catalogue remains the primary service, and user contributions are ancillary.

If Echo is a hosting service or online platform, a simple notice-and-action route and clear reasons for restrictions are the proportionate controls to retain. If the operator qualifies as a micro or small enterprise, DSA Article 19 limits the additional online-platform Section 3 duties, subject to its exception, so Article 20-style internal complaint handling and other larger-platform machinery should not be demanded without confirming that the classification and size tests apply. Reassess if user content becomes the core service, the audience grows materially, or paid marketplace functions are introduced.

### F4. Rating cookie and local storage

PTS guidance treats storage needed for a service the user has expressly requested differently from optional tracking storage. Echo’s current first-party rating identifiers are created only after an active rating, rating-clear, or helpful-vote action. They support maintaining, updating, clearing, and protecting that requested action; passive show-page browsing does not create the profile or set the voter cookie. The linked localStorage value is used by the rating UI, while the HTTP-only cookie is used by the server.

On those facts, treating the current identifiers as technically necessary for the requested feature is reasonable. It does not require a site-wide consent banner for optional analytics that is not present. If the identifiers are later reused for analytics, advertising, profiling, cross-site tracking, or pre-action tracking, the classification must be revisited and an appropriate consent flow added. Cloudflare edge RUM is not folded into this conclusion; its storage behavior must be assessed from actual provider configuration.

### F5. Age, audience, and jurisdiction

The reviewed pages describe Echo as general-audience and not specifically directed at children. No current evidence shows a child-directed service or a large child-data workflow. Keep the current warning and removal route, and revisit if the product begins targeting children, collecting age data, opening accounts, or operating paid consumer features. This is not a current deployment blocker.

### F6. Backups and deletion

GDPR minimisation, retention, security, and rights obligations apply to live data and should be reflected in backup access, expiry, restoration, and deletion procedures. A backup schedule that retains older copies for a documented limited period is not automatically unlawful. The fact that the physical region of an unknown backup is not yet recorded is an operational due-diligence gap, not a standalone critical blocker. The operator should document provider, access, retention, restore testing, and any transfer mechanism as the production setup becomes final.

## NOT APPLICABLE / RESOLVED

### N1. EU representative — not applicable on current establishment facts

GDPR Article 27 concerns controllers or processors **not established in the Union** that are subject to Article 3(2). The operator is established in Sweden, an EU Member State. An EU representative is therefore **N/A on the current facts** and has been removed as a blocker. This would need reconsideration only if the operator/establishment facts changed.

### N2. Direct IMY complaint information — retained

The privacy page retains a direct link to IMY’s GDPR complaint route. It does not claim that contacting Echo replaces a supervisory-authority complaint.

### N3. Current cookie-banner position — resolved for the reviewed implementation

The reviewed repository contains no repo-managed optional analytics, advertising, or marketing storage. The active rating storage is documented as feature-triggered functional storage, and the page states exactly when that reasoning must be revisited. A banner remains a future requirement if optional storage is introduced; it is not a current blanket requirement.

### N4. Cloudflare/RUM wording — corrected in the repository

The repository no longer claims that RUM is definitely anonymous, never uses cookies/local storage, or cannot identify a person. It says Cloudflare may inject RUM depending on production settings and that the repository cannot establish its dataset, storage, retention, or identity behavior. Cloudflare is documented as a processor/service provider where applicable, with the provider’s own role/terms caveat.

### N5. Legal-page acknowledgement and version handling — retained and tested

The source and generated legal pages use September 8, 2026. The browser submission API sends legal version `2026-09-08`; the server requires an acknowledgement for that exact version when enabled and rejects the superseded August 20 version. The form links to Terms and Privacy, and the public copyright/content notice route remains available.

## Reassessment of the previous “critical blockers”

The previous review treated all eight open items as blockers. The reassessment is:

| Previous item | New classification | Why |
| --- | --- | --- |
| Controller postal address, organisation/VAT details | **FOLLOW-UP** | GDPR controller name/contact is present. Swedish e-commerce section 8 is conditional on the service falling within the remuneration-based information-society-service rules. Do not publish a residential address or invent registration data. |
| DPO and EU representative | **N/A / FOLLOW-UP** | Article 37 is not triggered by current small-scale processing; Article 27 is N/A for a Sweden-established operator. Reassess only if facts change. |
| Production processors, transfers, backups, Cloudflare settings | **IMPORTANT** | Article 13/28/32–34 and transfer safeguards matter where relevant, but unknown provider-region or backup details do not prove a breach. Verify actual settings and reclassify a concrete mismatch. |
| Cookie and local-storage classification | **RESOLVED for current scope / FOLLOW-UP on change** | Storage follows an active requested rating/helpful action and is not used as optional analytics in the reviewed build. Reassess if purpose or timing changes. |
| DSA classification and elaborate mechanisms | **IMPORTANT / FOLLOW-UP** | DSA may conditionally touch reviews and other public submissions, but Echo’s small ancillary user-content model supports a simple electronic notice route. No larger-platform system is justified by current facts. |
| Rights and asset provenance | **IMPORTANT** | Real copyright/attribution risk and a worthwhile control gap; the existing notice route plus staged provenance work is proportionate. Incomplete legacy provenance does not justify deleting the catalogue. |
| Age and jurisdiction scope | **FOLLOW-UP** | General-audience, not child-directed, with no current evidence of a child-data or paid-consumer trigger. Reassess when product scope changes. |
| Deployment parity | **CRITICAL** | Public pages demonstrably remain on `v1.0.2`/August 20 while the reviewed source is September 8. This is a concrete release mismatch and should block claiming the revised legal state is deployed. |

## Changes made in code and content

- Rewrote the legal review into the proportionate classifications above.
- Removed the unsupported Cloudflare RUM claims about fixed anonymity, cookies/local storage, and identity; retained a qualified configuration-dependent disclosure.
- Described Cloudflare as a processor/service provider where it acts on the controller’s behalf, while preserving the independent-provider-role caveat and links to its privacy policy and applicable DPA.
- Added/retained the catalogue and public-source data categories, purposes, retention context, direct IMY complaint link, and clear correction/takedown paths.
- Kept September 8, 2026 legal-page versioning and exact `2026-09-08` submission acknowledgement handling.
- Added a lightweight optional provenance schema and validation for source URLs, source types, description origin, artwork, logos, and rights notes.
- Mapped existing importer field evidence into provenance for future imported records and added a read-only coverage report. Existing catalogue records remain intact and may remain legacy/unknown.
- Expanded the content notice route to expressly cover artwork, logos, descriptions, catalogue material, ratings, and reviews.
- Added schema documentation and regression coverage for provenance, legal-page/version parity, stale acknowledgement rejection, and legal notice/storage copy.

## What remains to deploy

No deployment was performed. An authorised release needs to include, at minimum, the reviewed legal source and generated surfaces:

- `site-src/pages/privacy.html`, `site-src/pages/terms.html`, `site-src/pages/cookies.html`, and `site-src/pages/copyright.html`;
- generated `privacy.html`, `privacy/index.html`, `terms.html`, `terms/index.html`, `cookies.html`, `cookies/index.html`, `copyright.html`, and `copyright/index.html`;
- `shared/app/submit/api.js` and `backend/lib/services/submission-service.js` so the client/server acknowledgement version agrees;
- the provenance runtime/schema changes if the importer support is intended to ship in the same release.

Tests and review documents do not need to be served as runtime pages, but should remain with the release source. The checkout also contains unrelated dirty catalogue expansion and generated-data changes; those should not be deployed merely because this legal review exists. After an authorised release, fetch the live home page and all four legal routes and verify the September 8 date, current footer version, revised RUM wording, direct IMY link, and acknowledgement behavior.

## Owner decisions or facts still needed

1. Decide whether Echo’s real operator/service model falls within Swedish Electronic Commerce Act section 8. If yes, provide an approved service/contact address; do not provide a private residential address unless you expressly choose that and it is legally appropriate.
2. Provide organisation/VAT details only if an actual applicable registration or tax obligation exists. None have been inferred here.
3. Verify production Cloudflare, host, log, backup, Turnstile/RUM, provider-contract, retention, and transfer settings from account/operator records.
4. Decide whether to prioritize provenance enrichment for high-traffic or high-risk listings first; no catalogue-wide migration is required for deployment.
5. Reassess DPO, DSA, age, consumer, and address conclusions if Echo adds accounts, paid services, targeted child features, materially larger public user content, or profiling/analytics.

## Exact validation run

- `npm run build:pages` — passed; regenerated root and clean-route pages from `site-src`.
- `npm run test:tools` — passed: 55 passed, 0 failed, 3 skipped because Restic is not installed in this environment (58 tests total).
- `node --test backend/test/site-structure.test.js backend/test/data-retention.test.js` — passed: 16 passed, 0 failed.
- `node --test backend/test/import-service.test.js` — passed: 18 passed, 0 failed.
- `npm --prefix backend run validate:data` — passed: 752 shows, 46 collections, 42 curated entities, 172 linked published shows.
- `npm run report:provenance` — passed: 752 total/published shows; 0 explicit top-level provenance records; 752 legacy/unknown; 752 with existing objective source evidence; 683 with existing importer source evidence; 0 with the new description/artwork/rights-note fields. This is a baseline report, not a rights clearance.
- `node --check` run for `tools/lib/catalog-provenance.js`, `tools/report-provenance.js`, `backend/lib/import/draft.js`, and `backend/lib/catalog.js` — passed.
- `npm run check:structure` — failed on an existing unrelated hard line-budget violation: `shared/styles/home/entity-detail.css` is 624 lines against a 550-line hard limit; it also reported existing soft-limit warnings. No structure files were changed for this legal review.
- `git diff --check` — passed with no whitespace errors.
- `npm run verify` — not run; the focused checks above were used because the repository documents the full verification command as expensive and this change was validated through targeted legal, importer, schema, and data checks.

## Conclusion

Echo has concrete GDPR transparency, security, retention, rights-handling, and provider-accountability work to maintain, but the prior blanket blocker list overstated several conditional or size-sensitive obligations. The realistic current release gate is to deploy and verify the corrected September legal surfaces, while keeping the address question, production provider evidence, DSA boundary, and provenance enrichment documented as proportionate follow-ups rather than inventing facts or building systems the current service does not require.
