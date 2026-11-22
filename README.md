# Rift Docs

[docs.rift.cool](https://docs.rift.cool): every Rift command, generated from the running bot.

There is no command list in this repository. The page fetches
`https://api.rift.cool/api/public/commands` in the browser and renders it, so a
command added to the bot shows up here after the bot restarts, with no docs
change. The last good response is cached in `localStorage` so the page still
opens if the API is briefly unreachable.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `assets/style.css` | Styles (same design language as rift.cool; self-hosted Geist) |
| `assets/app.js` | Fetches, caches, searches and renders the catalogue |
| `CNAME` | `docs.rift.cool` for GitHub Pages |

## The API contract

`GET /api/public/commands` returns `schema_version: 1`:

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-11-22T21:00:00Z",
  "bot": { "name": "Rift", "default_prefix": "!" },
  "stats": { "commands": 788, "categories": 78, "slash": 586, "prefix": 596, "hybrid": 394 },
  "categories": [
    {
      "id": "moderation", "name": "Moderation", "description": "...", "count": 168,
      "commands": [
        {
          "name": "ban", "path": "ban", "type": "command",        // or "group"
          "description": "...", "kinds": ["prefix", "slash"],
          "aliases": [], "usage": "ban <member> [reason]",
          "parameters": [{ "name": "member", "type": "Member", "required": true, "description": "" }],
          "permissions": ["ban_members"],
          "subcommands": []                                         // children of a group
        }
      ]
    }
  ]
}
```

A new `schema_version` is only introduced for breaking changes; the page shows a
clear error instead of guessing if it sees one it doesn't know.

## Run it locally

It is static, so any file server works: `python3 -m http.server 4180`.
Hidden commands, owner-only commands and developer cogs are filtered out by the
bot before they are sent.

Friendly category names and blurbs live in the bot (`utils/command_catalog.py`,
`CATEGORY_META`). A cog without an entry still appears, under a name derived
from the cog, or set `docs_name` / `docs_description` on the cog.
