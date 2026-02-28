# Contributing to email-for-agents

Thanks for contributing! This repo exists to help developers give their AI agents a real email address and phone number — the more examples and frameworks covered, the more useful it is for everyone.

## What we welcome

- **New platform integrations** — AutoGen, Pydantic AI, Haystack, Dify, n8n, Flowise, etc.
- **New use-case examples** — real problems AI agents solve using email and SMS
- **Bug fixes** — if an example is broken, out of date, or uses the wrong API
- **Capability demos** — showing off specific Commune features (threading, extraction, vector search, webhooks)
- **Better documentation** — clearer READMEs, more helpful `.env.example` files

## How to contribute

1. **Fork** the repo and create a branch: `git checkout -b add-autogen-example`
2. **Build the example** — make sure it actually runs end-to-end with a real Commune API key
3. **Add the structure:**
   - `README.md` explaining what it does and how to run it
   - `.env.example` with all required variables listed
   - `requirements.txt` or `package.json` with pinned minimum versions
4. **Open a PR** — describe what you built, why it's useful, and any constraints

## Code standards

- Python: `ruff` for linting (`pip install ruff && ruff check .`)
- TypeScript: strict mode, `tsc --noEmit` should pass
- No real API keys, email addresses, or phone numbers in committed files
- Every `.env.example` uses obvious placeholders (`your_api_key_here`, not `sk-abc123`)

## Example structure

```
langchain/                     ← platform
  customer-support/            ← use case
    agent.py                   ← main entrypoint
    requirements.txt
    .env.example
    README.md
```

## Questions?

Open an issue or email hello@commune.email.
