# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for production AI agent email systems built with Commune. Each ADR documents a significant technical decision: the context that made it difficult, the alternatives that were seriously evaluated, and the consequences — including real costs.

ADRs are numbered sequentially and not edited after acceptance. Decisions that supersede earlier ones create a new ADR that references the old one.

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-001](001-use-thread-id-for-all-replies.md) | Use thread_id for all reply flows | Accepted | 2026-03-01 |
| [ADR-002](002-verify-webhook-signatures-before-parse.md) | Verify webhook signatures before parsing request body | Accepted | 2026-03-01 |
| [ADR-003](003-extraction-schemas-over-llm-parsing.md) | Use extraction schemas instead of LLM parsing for structured email data | Accepted | 2026-03-01 |
| [ADR-004](004-one-inbox-per-agent-identity.md) | One inbox per agent identity | Accepted | 2026-03-01 |
| [ADR-005](005-sync-vs-async-client-selection.md) | Select sync vs async client based on runtime context | Accepted | 2026-03-01 |
| [ADR-006](006-idempotency-keys-for-agent-email-sends.md) | Idempotency keys for all agent email sends | Accepted | 2026-03-01 |
| [ADR-007](007-prompt-injection-defense-at-webhook-boundary.md) | Prompt injection defense at the webhook boundary | Accepted | 2026-03-01 |
| [ADR-008](008-background-processing-for-webhook-handlers.md) | Background processing for webhook handlers | Accepted | 2026-03-01 |

## One-line summaries

**ADR-001** — Use `thread_id` (not subject matching) as the authoritative identifier for email thread membership; subjects change, RFC-5322 header chains don't.

**ADR-002** — Capture raw request bytes before any JSON parsing; HMAC is computed over the original wire bytes, not over re-serialized data.

**ADR-003** — Configure a JSON schema on the inbox once; Commune extracts structured fields before the webhook fires, eliminating per-email LLM extraction calls.

**ADR-004** — Provision one Commune inbox per agent identity; routing by URL path (inbox-specific webhook) is reliable while routing by email content (shared inbox keyword matching) is not.

**ADR-005** — Use `AsyncCommuneClient` in async frameworks (FastAPI, async Django) and `CommuneClient` in sync contexts (Celery, Flask, management commands); mixing them blocks event loops or wastes thread pool overhead.

**ADR-006** — Pass an `idempotency_key` on every `messages.send()` call; Celery and webhook retry loops will re-run sends, and only API-level idempotency prevents duplicate emails.

**ADR-007** — Check `metadata.prompt_injection_detected` before any LLM call; email is an open channel and injection detection at the boundary limits blast radius before model inference occurs.

**ADR-008** — Return HTTP 200 from the webhook handler immediately after enqueueing a background task; synchronous LLM processing inside the handler will exceed Commune's 30-second delivery timeout, triggering retries and duplicate processing.

## How to read these ADRs

The **Context** section explains why the decision was non-obvious — what competing requirements created the tension. If the context section seems unnecessary, the decision was probably obvious.

The **Alternatives Considered** section documents what was seriously evaluated. These are not strawmen — they are approaches that have real merits and were rejected for specific reasons that only become visible in production.

The **Consequences** section is honest about costs. Every ADR in this directory has a "Negative" subsection because no architectural decision is free. If a decision has no documented costs, the document is incomplete.

## Cross-references

Many of these ADRs address the same underlying problem from different angles:

- **Correctness** (thread continuity): ADR-001, ADR-006
- **Security** (webhook integrity, injection): ADR-002, ADR-007
- **Performance** (event loop, connection pools): ADR-005, ADR-008, ADR-010
- **Cost** (extraction without LLM, deduplication): ADR-003, ADR-006
- **Isolation** (per-agent state): ADR-004
