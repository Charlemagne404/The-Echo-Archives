# Future Data Model

## Goal

The catalog model should be rich enough to drive discovery, but simple enough to maintain by hand in versioned JSON at the beginning.

Do not overengineer this on day one. Start with the fields that support:

- browse cards
- show pages
- search and filters
- curated collections
- grounded recommendations

## Proposed `show` object

```json
{
  "id": "impact-winter",
  "title": "Impact Winter",
  "subtitle": "Post-apocalyptic vampire survival under endless winter.",
  "description": "A spoiler-free archive description.",
  "cover": "Impact Winter/Impact-winter.jpeg",
  "coverAlt": "Impact Winter cover art",
  "status": "published",
  "reviewStatus": "full-review",
  "releaseStatus": "active",
  "completionStatus": "ongoing",
  "creator": "Example Creator",
  "network": "Example Network",
  "officialSite": "",
  "listenLinks": {
    "spotify": "",
    "apple": "",
    "rss": "",
    "website": ""
  },
  "genres": ["sci-fi", "fantasy", "survival"],
  "tones": ["dark", "cinematic", "intense"],
  "formats": ["full-cast", "serialized"],
  "settings": ["post-apocalyptic", "bunker", "castle"],
  "themes": ["survival", "family", "power"],
  "contentWarnings": [],
  "length": {
    "seasons": 3,
    "episodes": 36,
    "avgEpisodeMinutes": 30,
    "totalHours": 18
  },
  "ratings": {
    "archive": 10,
    "voiceActing": 10,
    "soundDesign": 10,
    "story": 9,
    "characters": 9,
    "ads": 9.5,
    "length": 9
  },
  "bestFor": ["long-walks", "binge-listening", "high-production-sci-fi"],
  "similarTo": ["were-alive", "end-of-all-hope"],
  "wouldRelisten": true,
  "featured": true,
  "spoilerFreeReview": "",
  "archiveTake": "",
  "createdAt": "YYYY-MM-DD",
  "updatedAt": "YYYY-MM-DD"
}
```

## Field notes

- `id`: stable slug, lowercase kebab-case, never generated from page filenames at runtime
- `status`: publish state for the archive record itself
- `reviewStatus`: whether the show has a full review, short entry, or is indexed-only
- `releaseStatus`: whether the real-world show is active, finished, inactive, or unknown
- `completionStatus`: listener-facing completion signal
- `description`: short spoiler-free archive description
- `archiveTake`: short editorial viewpoint for cards and summaries
- `spoilerFreeReview`: longer review text when available

## Recommended controlled vocabularies

These should stay small at first. Expand only when the archive actually needs more granularity.

### Genres

- `sci-fi`
- `fantasy`
- `horror`
- `mystery`
- `thriller`
- `comedy`
- `drama`
- `adventure`
- `post-apocalyptic`
- `supernatural`

### Tones

- `dark`
- `bleak`
- `tense`
- `funny`
- `chaotic`
- `warm`
- `hopeful`
- `melancholic`
- `cinematic`
- `weird`

### Formats

- `full-cast`
- `narrated`
- `hybrid`
- `serialized`
- `episodic`
- `anthology`
- `limited-series`
- `long-running`

### Release status

- `active`
- `completed`
- `hiatus`
- `inactive`
- `unknown`

### Review status

- `full-review`
- `spotlight`
- `indexed-only`
- `planned`

### Completion status

- `ongoing`
- `finished`
- `cancelled`
- `unclear`

### Best-for tags

- `long-walks`
- `binge-listening`
- `late-night`
- `headphones-on`
- `worldbuilding`
- `easy-entry`
- `serious-sci-fi`
- `funny-space-disasters`
- `cold-isolation-horror`
- `short-under-five-hours`

## Recommended companion objects

### Collection object

```json
{
  "id": "best-for-long-walks",
  "title": "Best for long walks",
  "description": "Shows that hold momentum for extended listening sessions.",
  "kind": "curated",
  "showIds": ["impact-winter", "derelict", "midnight-burger"],
  "featured": true,
  "updatedAt": "YYYY-MM-DD"
}
```

### Creator object

```json
{
  "id": "example-creator",
  "name": "Example Creator",
  "website": "",
  "notes": ""
}
```

### Network object

```json
{
  "id": "example-network",
  "name": "Example Network",
  "website": "",
  "notes": ""
}
```

## Validation rules

- every `show.id` must be unique
- every `similarTo` id must resolve to a real show
- every `bestFor` value should come from a known vocabulary
- every link field may be blank, but if present must be valid URL text
- `ratings.archive` is editorial and optional for indexed-only entries
- `reviewStatus` must not imply a full review exists when one does not

## Start practical

The first version of `shows.json` does not need every field filled for every show.

Good initial requirement:

- enough data to render today’s cards
- enough data to express whether a show has a live full review
- enough metadata to power search and collections

Everything else can fill in over time.
