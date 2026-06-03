# Echo Archives Data Schema

## Purpose

`data/shows.json` is the canonical editorial catalog.
`data/collections.json` is the canonical curated discovery layer.

The frontend, chat assistant, and community features should all read from these files instead of scraping HTML.

## Show Shape

Each show record uses this practical v1 shape:

```json
{
  "id": "impact-winter",
  "title": "Impact Winter",
  "subtitle": "Post-apocalyptic vampire survival under endless winter.",
  "description": "Spoiler-free archive description.",
  "cover": "Impact Winter/Impact-winter.jpeg",
  "coverAlt": "Impact Winter cover art",
  "status": "published",
  "reviewStatus": "full-review",
  "releaseStatus": "active",
  "completionStatus": "ongoing",
  "listenLinks": {
    "spotify": "",
    "apple": "",
    "website": "",
    "rss": ""
  },
  "genres": ["sci-fi"],
  "tones": ["dark", "cinematic"],
  "formats": ["full-cast", "serialized"],
  "tags": ["Survival", "Post-apocalyptic", "Vampires"],
  "length": {
    "label": "18 hours total",
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
  "facts": {
    "structure": "Alternates between characters.",
    "narrator": "Yes (in-universe journal).",
    "ads": "Mixed (season 1 and 2 yes, season 3 no).",
    "favoriteRun": "Season 1, episodes 4 through 8.",
    "wouldRelisten": true
  },
  "bestFor": ["long-walks", "headphones-on"],
  "similarTo": ["were-alive", "end-of-all-hope"],
  "similarReasons": {
    "were-alive": "Another survival-first ensemble listen with strong urgency."
  },
  "archiveTake": "Short editorial take used on cards and detail pages.",
  "spoilerFreeReview": "Longer review text when available.",
  "thoughts": "Personal archive reaction when available.",
  "quote": {
    "text": "You make the choices you can live with.",
    "attribution": "Rook"
  },
  "featured": true,
  "createdAt": "2026-06-01",
  "creatorId": "example-creator",
  "networkId": "example-network",
  "accent": {
    "hex": "#851a28",
    "rgb": "133, 26, 40"
  },
  "updatedAt": "2026-06-02"
}
```

## Required Fields

- `id`
- `title`
- `description`
- `cover`
- `coverAlt`
- `status`
- `reviewStatus`
- `genres`
- `tags`
- `ratings.archive`
- `updatedAt`

## Controlled Values

### `status`

- `published`
- `draft`

### `reviewStatus`

- `full-review`
- `spotlight`
- `indexed-only`
- `planned`

### `releaseStatus`

- `active`
- `completed`
- `hiatus`
- `inactive`
- `unknown`

### `completionStatus`

- `ongoing`
- `finished`
- `cancelled`
- `unclear`

### Preferred `genres`

- `sci-fi`
- `fantasy`
- `horror`
- `mystery`
- `thriller`
- `comedy`
- `drama`
- `adventure`
- `science`
- `supernatural`

### Preferred `tones`

- `dark`
- `bleak`
- `tense`
- `warm`
- `funny`
- `chaotic`
- `hopeful`
- `cinematic`
- `weird`
- `melancholic`

### Preferred `formats`

- `full-cast`
- `narrated`
- `serialized`
- `episodic`
- `anthology`
- `limited-series`
- `long-running`

### Preferred `bestFor`

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

## Validation Rules

- Every `id` must be unique.
- Every `similarTo` id must resolve to a real show.
- Every `similarReasons` key must also appear in `similarTo`.
- Every populated URL in `listenLinks` must be a valid absolute URL.
- `createdAt` and `updatedAt` must be valid dates when present.
- `creatorId` and `networkId` must use slug ids when present.
- `bestFor`, `tags`, `genres`, `tones`, and `formats` must not contain duplicates after lowercase normalization.
- `reviewStatus: full-review` should only be used when richer review fields actually exist.

## Collection Shape

Collections stay simple in v1:

```json
{
  "id": "best-for-long-walks",
  "title": "Best for long walks",
  "description": "Shows that keep momentum over longer listening sessions.",
  "kind": "curated",
  "showIds": ["impact-winter", "derelict"],
  "showReasons": {
    "impact-winter": "Sustains momentum during longer listening blocks."
  },
  "featured": true,
  "createdAt": "2026-06-01",
  "updatedAt": "2026-06-02"
}
```

## Optional companion datasets

The loader also accepts these files when they exist:

- `data/creators.json`
- `data/networks.json`
- `data/changelog.json`

Their public routes and UI stay hidden until the data is present and valid.

## Maintainability Rules

- One record per show.
- One record per collection.
- Do not derive catalog truth from page filenames or DOM markup.
- Keep v1 hand-editable.
