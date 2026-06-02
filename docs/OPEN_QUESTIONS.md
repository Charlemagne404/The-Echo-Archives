# Open Questions

## Architecture

- Should the site stay mostly static with versioned JSON files for the next stage, or is there already a good reason to move to a full database-backed catalog?
- Should the frontend fetch data client-side, or should the backend pre-render selected pages from the catalog?
- Should `podcast-data.json` be migrated directly into `data/shows.json`, or should it be treated as legacy input and replaced manually during migration?

## Submission workflow

- Should show submissions keep using Tally for now, or move to GitHub issues, email, or a custom backend flow?
- How should creator corrections be submitted and tracked?
- What minimum data is required before a submitted show is allowed into the archive?

## Catalog boundaries

- What exactly counts as an "audio drama" versus a fiction podcast more broadly?
- Should actual play shows be included?
- Should non-English shows be included?
- Should anthology feeds with mixed formats be included?

## Editorial model

- Should full reviews be required for inclusion, or should indexed-only entries be a normal and permanent part of the archive?
- How should incomplete data be displayed on show pages?
- Should episode guides exist for every show, or only for full-review entries?
- How formal should the curation policy be?

## Ratings

- Should user ratings remain anonymous indefinitely?
- At what vote count should a community average become publicly visible?
- Should Archive Rating and Community Rating always be shown separately?
- How much anti-spam protection is necessary before public launch?

## Product scope

- At what point are accounts actually worth adding?
- How many shows should be indexed before a broader public launch push?
- Should there be creator, network, or franchise pages in the first public version?
- Should "similar to" pages be hand-curated, data-derived, or both?

## Brand and positioning

- Should the footer continue to say "A product of Continental Studios," or is "A Continental project" the better long-term label?
- Should the chat assistant be fully renamed in the UI to "Ask the Archivist" across the site?
