# Skill: Commune SMS

## What I Can Do

I give you a real phone number and let you send and receive SMS messages programmatically via the Commune API. You can send texts to any number, read conversation threads, and list all your SMS conversations — all from within your OpenClaw agent.

## Authentication

Requires `COMMUNE_API_KEY` environment variable. Get one at commune.email.

```
Base URL: https://api.commune.email
Auth header: Authorization: Bearer $COMMUNE_API_KEY
Content-Type: application/json
```

## My Phone Number

`COMMUNE_PHONE_NUMBER` — set this environment variable to your full phone number after provisioning (e.g. `+14155551234`). Also set `COMMUNE_PHONE_ID` to the phone number's ID string.

---

## Core Operations

### List Phone Numbers

```
GET /v1/phone-numbers
```

Response:
```json
[
  {
    "id": "pn_xxx",
    "number": "+14155551234",
    "label": "Support Line",
    "capabilities": ["sms"]
  }
]
```

Use this to discover your available phone numbers and their IDs. Save the relevant `id` as `COMMUNE_PHONE_ID`.

---

### Send SMS

```
POST /v1/sms/send
Body: {
  "to": "+14155559876",
  "body": "Your meeting is at 3pm today.",
  "phone_number_id": "pn_xxx"
}
```

Response includes `message_id` for confirmation.

**Number format:** Always use E.164 format (`+1XXXXXXXXXX` for US numbers). If the user gives a 10-digit number, prepend `+1`.

---

### List SMS Conversations

```
GET /v1/sms/conversations?phone_number_id=PHONE_ID
```

Response:
```json
[
  {
    "contact_number": "+14155559876",
    "last_message": "Thanks, see you then!",
    "last_message_at": "2026-02-28T09:30:00Z",
    "message_count": 5,
    "direction": "inbound"
  }
]
```

`direction: "inbound"` means the last message came from the other person — this conversation may need a reply.

---

### Read SMS Conversation with a Specific Number

```
GET /v1/sms/conversations/:number
```

Where `:number` is the contact's phone number in E.164 format (URL-encoded: `%2B14155559876`).

Response:
```json
[
  {
    "id": "sms_xxx",
    "direction": "inbound",
    "body": "Can we reschedule to 3pm?",
    "from": "+14155559876",
    "to": "+14155551234",
    "created_at": "2026-02-28T09:00:00Z"
  },
  {
    "id": "sms_yyy",
    "direction": "outbound",
    "body": "Sure, 3pm works!",
    "from": "+14155551234",
    "to": "+14155559876",
    "created_at": "2026-02-28T09:05:00Z"
  }
]
```

---

## Shell Helper

A CLI helper is included at `~/.openclaw/workspace/skills/commune-sms/commune-sms.js`. Run it for quick SMS operations:

```bash
node ~/.openclaw/workspace/skills/commune-sms/commune-sms.js <command> [args]
```

Available commands:
| Command | Args | What it does |
|---------|------|--------------|
| `list-numbers` | — | Lists your Commune phone numbers |
| `send` | `to body [phone_id]` | Sends an SMS |
| `list-convos` | `[phone_id]` | Lists all SMS conversations |
| `read-thread` | `contact_number [phone_id]` | Reads conversation with a number |

If `COMMUNE_PHONE_ID` is set, `phone_id` arguments are optional.

---

## Workflow Patterns

### Sending a text message

1. Get the recipient's number from context (or ask the user)
2. Normalize to E.164 format if needed
3. `POST /v1/sms/send` with `to`, `body`, `phone_number_id`
4. Confirm with the message_id

### Checking recent texts

1. `GET /v1/sms/conversations?phone_number_id=...`
2. Filter by `direction: "inbound"` for conversations needing a reply
3. For a specific contact, `GET /v1/sms/conversations/:number`

### Replying to a text

Sending a reply is the same as sending a new SMS — just use the same `to` number. There is no separate reply endpoint. The conversation history is maintained automatically.

---

## Usage Examples

- "Text +14155551234 that I'm running 10 minutes late" → `POST /v1/sms/send`
- "What did John text me?" → read conversation with John's number
- "Show me my recent texts" → `GET /v1/sms/conversations?phone_number_id=...`
- "List my Commune phone numbers" → `GET /v1/phone-numbers`
- "Text the client that their order has shipped" → `POST /v1/sms/send`
- "Has anyone texted me since this morning?" → list conversations, check `last_message_at`

---

## Number Formatting

When a user says a phone number, normalize it before sending:
- `415-555-1234` → `+14155551234`
- `(415) 555-1234` → `+14155551234`
- `4155551234` → `+14155551234`
- Already has `+1` → use as-is
- Non-US numbers: use the full E.164 format with country code

---

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 401 | Invalid API key | Check `COMMUNE_API_KEY` |
| 400 | Invalid number format | Ensure E.164 format with `+` prefix |
| 404 | Phone number not found | Verify `COMMUNE_PHONE_ID` with `list-numbers` |
| 429 | Rate limited | Wait and retry |
| 5xx | Server error | Retry after a short delay |

Always check the response body for an `error` or `message` field when a request fails.
