# Skill: Commune Email

## What I Can Do

I give you a real email inbox and let you send, receive, search, and manage email threads programmatically via the Commune API. Every inbox I create is RFC 5322 compliant — replies thread correctly in any email client, including Gmail, Apple Mail, and Outlook.

## Authentication

Requires `COMMUNE_API_KEY` environment variable. Get one at commune.email.

```
Base URL: https://api.commune.email
Auth header: Authorization: Bearer $COMMUNE_API_KEY
Content-Type: application/json
```

## My Inbox Address

`COMMUNE_INBOX_ADDRESS` — set this environment variable to your full inbox address after creation (e.g. `assistant@yourdomain.commune.email`). Also set `COMMUNE_INBOX_ID` to the inbox's ID string.

---

## Core Operations

### Create Inbox

```
POST /v1/inboxes
Body: { "localPart": "assistant" }
Response: { "id": "inbox_xxx", "address": "assistant@yourdomain.commune.email" }
```

Save the returned `id` as `COMMUNE_INBOX_ID` and `address` as `COMMUNE_INBOX_ADDRESS`.

---

### List Email Threads

```
GET /v1/threads?inbox_id=INBOX_ID&limit=20
```

Response shape:
```json
{
  "data": [
    {
      "thread_id": "thread_xxx",
      "subject": "Re: Contract draft",
      "last_direction": "inbound",
      "message_count": 3,
      "last_message_at": "2026-02-28T10:00:00Z"
    }
  ]
}
```

**Important:** `last_direction: "inbound"` means the last message came from the other person — this thread is waiting for a reply. `last_direction: "outbound"` means you replied last.

---

### Read a Thread

```
GET /v1/threads/THREAD_ID/messages
```

Returns an array of messages with:
- `direction`: `"inbound"` or `"outbound"`
- `content`: the message body text
- `participants`: array of `{ role: "sender"|"recipient", identity: "email@address.com" }`
- `metadata.subject`: the email subject

Always read the full thread before replying — context matters.

---

### Send Email (New Thread)

```
POST /v1/messages/send
Body: {
  "to": "recipient@example.com",
  "subject": "Meeting notes from today",
  "text": "Hi Sarah, here are the notes...",
  "inboxId": "INBOX_ID"
}
```

Response includes `message_id` for tracking.

---

### Reply in Existing Thread

```
POST /v1/messages/send
Body: {
  "to": "sender@example.com",
  "subject": "Re: Original Subject",
  "text": "Thanks for your email...",
  "inboxId": "INBOX_ID",
  "thread_id": "thread_xxx"
}
```

**Critical:** Always include `thread_id` when replying to keep the conversation threaded. Without it, a new thread is created. Always prefix the subject with `Re: ` when replying.

---

### Search Email (Semantic)

```
GET /v1/search/threads?q=QUERY&inbox_id=INBOX_ID
```

Uses vector/semantic search — natural language queries work well. Examples:
- `?q=contract negotiations`
- `?q=invoice overdue`
- `?q=meeting cancellation`

Returns an array of threads with a `score` field (0–1, higher is more relevant).

---

### Update Thread Status

```
PUT /v1/threads/THREAD_ID/status
Body: { "status": "closed" }
```

Status options:
- `open` — active, needs attention
- `needs_reply` — explicitly flagged for reply
- `waiting` — waiting on the other party
- `closed` — resolved, no further action needed

---

### Add Tags to Thread

```
POST /v1/threads/THREAD_ID/tags
Body: { "tags": ["urgent", "billing", "vip"] }
```

Tags are freeform strings. Useful for classifying threads before reporting or routing.

---

## Shell Helper

A CLI helper is included at `~/.openclaw/workspace/skills/commune-email/commune.js`. Run it for quick operations without constructing raw HTTP requests:

```bash
node ~/.openclaw/workspace/skills/commune-email/commune.js <command> [args]
```

Available commands:
| Command | Args | What it does |
|---------|------|--------------|
| `list-threads` | `[inbox_id]` | Lists threads, flags ones waiting for reply |
| `read-thread` | `thread_id` | Prints full conversation |
| `send` | `to subject body [inbox_id]` | Sends a new email |
| `reply` | `thread_id to body [inbox_id]` | Replies in a thread |
| `search` | `query [inbox_id]` | Semantic search |
| `create-inbox` | `local_part` | Creates a new inbox |

If `COMMUNE_INBOX_ID` is set, `inbox_id` arguments are optional.

---

## Workflow Patterns

### Checking for new email

1. `GET /v1/threads?inbox_id=...&limit=20`
2. Filter for `last_direction: "inbound"` — those need replies
3. For each, `GET /v1/threads/:id/messages` to read the content
4. Summarize or act as instructed

### Replying to a specific email

1. Search for the thread: `GET /v1/search/threads?q=...`
2. Read the thread: `GET /v1/threads/:id/messages`
3. Identify the sender from `participants` where `role: "sender"`
4. Send the reply: `POST /v1/messages/send` with `thread_id`

### Sending a new email

1. Compose subject and body
2. `POST /v1/messages/send` with `to`, `subject`, `text`, `inboxId`
3. Confirm with the message_id from the response

---

## Usage Examples

- "Check my Commune inbox" → `GET /v1/threads?inbox_id=$COMMUNE_INBOX_ID`
- "Reply to the email from Alex about the contract" → search, read, reply with `thread_id`
- "Search for emails about the invoice" → `GET /v1/search/threads?q=invoice`
- "Send Sarah the meeting notes" → `POST /v1/messages/send`
- "Mark the billing thread as resolved" → `PUT /v1/threads/:id/status { "status": "closed" }`
- "Flag this as urgent" → `POST /v1/threads/:id/tags { "tags": ["urgent"] }`

---

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 401 | Invalid API key | Check `COMMUNE_API_KEY` |
| 404 | Inbox or thread not found | Verify `COMMUNE_INBOX_ID` |
| 429 | Rate limited | Wait and retry |
| 5xx | Server error | Retry after a short delay |

Always check the response body for an `error` or `message` field when a request fails.
