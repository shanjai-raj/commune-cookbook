# Capabilities Reference — Commune for AI Agents

Deep dives on each Commune capability. Start here to understand how features work before building.

## Capabilities

| Capability | What it does | When to use |
|-----------|-------------|-------------|
| [Quickstart](quickstart/) | Create inbox, send email, receive webhook | Starting a new agent project |
| [Email Threading](email-threading/) | Reply in-thread with RFC 5322 compliance | Any email-based agent |
| [Structured Extraction](structured-extraction/) | Auto-parse email fields to JSON schema | Support tickets, orders, applications |
| [Semantic Search](semantic-search/) | Natural language search across history | Retrieving context before replying |
| [Webhook Delivery](webhook-delivery/) | Real-time delivery with 8-retry guarantee | Production agents needing reliability |
| [Phone Numbers](phone-numbers/) | Provision and manage real phone numbers | SMS-capable agents |
| [SMS](sms/) | Send, receive, broadcast SMS messages | Urgent notifications, lead qualification |

## Architecture overview

```
Your AI Agent
    ↕ commune-mail (Python) or commune-ai (TypeScript)
         ↕
     Commune Platform
         ├── Inbox Management (create, configure, delete)
         ├── Email Engine (inbound processing, outbound delivery)
         ├── Thread Store (RFC 5322 threading, history)
         ├── Vector Index (semantic search across email + SMS)
         ├── Extraction Engine (JSON schema parsing, zero extra LLM calls)
         ├── Webhook Dispatcher (HMAC-signed, 8 retries, circuit breaker)
         └── SMS Gateway (provision, send, receive, search)
```

## Recommended path

```
quickstart/ → email-threading/ → structured-extraction/ → webhook-delivery/
```

1. **[quickstart/](quickstart/)** — provision an inbox and phone number, send your first message. Covers Python and TypeScript. Takes under 60 seconds.

2. **[email-threading/](email-threading/)** — learn how to keep replies in the correct thread. Covers `In-Reply-To` / `References` headers (RFC 5322) and the `thread_id` pattern.

3. **[structured-extraction/](structured-extraction/)** — attach a JSON schema to an inbox so every inbound email is parsed automatically. No extra LLM calls required. Includes three ready-made schemas (support ticket, order confirmation, lead form).

4. **[webhook-delivery/](webhook-delivery/)** — receive emails in real time via HMAC-signed webhooks with 8-retry guaranteed delivery. Includes a reference handler and setup guide.

After those four, explore based on what you need:

- **[semantic-search/](semantic-search/)** — natural language search across your agent's entire inbox history using vector embeddings.
- **[phone-numbers/](phone-numbers/)** — provision and manage real phone numbers programmatically.
- **[sms/](sms/)** — send, receive, and broadcast SMS from a real phone number.

## Security layers

All inbound content passes through:
1. DNSBL check (sender IP against blackhole lists)
2. SPF/DKIM/DMARC validation
3. Content analysis (spam patterns, phishing keywords)
4. URL validation (typosquatting, low-authority domains)
5. Prompt injection detection (before content reaches your agent)
6. Attachment scanning (ClamAV + heuristic fallback)

## Install

```bash
# Python
pip install commune-mail

# TypeScript / Node
npm install commune-ai
```

Get your API key at [commune.email](https://commune.email) — free tier, no credit card required.

## Related

- [Use cases](../use-cases/) — domain-specific production patterns
- [Framework examples](../langchain/) — LangChain, CrewAI, OpenAI Agents, Claude, MCP
