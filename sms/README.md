# SMS for AI Agents — Commune

Give your agent a real phone number. Two-way SMS, unified search with email, instant escalation from email thread to SMS.

## When to use SMS vs email

| Scenario | Use | Why |
|----------|-----|-----|
| Urgent alerts | SMS | Immediate delivery, high open rate |
| Async conversation | Email | Threading, attachments, search |
| Appointment reminders | SMS | Short, time-sensitive |
| Customer onboarding | Email | Rich formatting, links |
| Critical incident | SMS first, email follow-up | SMS for urgency, email for details |
| Lead qualification | SMS | Higher response rate for cold outreach |

## Install

```bash
pip install commune-mail
export COMMUNE_API_KEY="comm_..."
```

## Provision a phone number

```python
from commune import CommuneClient

client = CommuneClient(api_key=os.environ["COMMUNE_API_KEY"])

# Get a real US phone number for your agent
phone = client.phone_numbers.provision()
print(phone.number)  # → +14155552671
print(phone.id)      # → pn_abc123 (use in send calls)
```

## Send SMS

```python
# Basic send
client.sms.send(
    to="+14155551234",
    body="Your order has shipped. Track it at: https://tracking.example.com/123",
    phone_number_id=phone.id,
)

# With idempotency key (prevent duplicate sends in retry loops)
client.sms.send(
    to="+14155551234",
    body=f"Order {order_id} shipped",
    phone_number_id=phone.id,
    idempotency_key=f"shipment-{order_id}",
)
```

## Receive SMS (webhook)

```python
from flask import Flask, request

app = Flask(__name__)

@app.post("/webhook/sms")
def handle_inbound_sms():
    payload = request.json

    from_number = payload["from"]
    body = payload["body"]
    phone_number_id = payload["phoneNumberId"]

    # Run your agent
    reply = agent.process(f"SMS from {from_number}: {body}")

    # Reply via SMS
    client.sms.send(
        to=from_number,
        body=reply,
        phone_number_id=phone_number_id,
    )

    return {"ok": True}
```

## Inbound webhook payload

```python
{
    "from_number": "+15551234567",   # E.164 — the person texting you
    "to_number": "+18005551234",     # your Commune phone number
    "body": "YES, I'll take the shift",
    "message_sid": "SM...",          # carrier message ID
    "thread_id": "abc123...",        # stable across messages with same number
    "num_segments": 1,
    "credits_charged": 2
}
```

Your webhook must return HTTP 200 within 10 seconds. Commune retries on failure with exponential backoff.

## Escalation pattern (email → SMS)

```python
import asyncio

async def send_with_sms_escalation(
    email_address: str,
    phone_number: str,
    subject: str,
    email_body: str,
    sms_body: str,
    escalate_after_hours: int = 4,
):
    # Send email first
    msg = client.messages.send(
        to=email_address,
        subject=subject,
        text=email_body,
        inbox_id=INBOX_ID,
    )

    # Wait for reply
    await asyncio.sleep(escalate_after_hours * 3600)

    # Check if replied
    thread = client.threads.get(msg.thread_id)
    if thread.message_count == 1:  # no reply yet
        # Escalate to SMS
        client.sms.send(
            to=phone_number,
            body=sms_body,
            phone_number_id=PHONE_NUMBER_ID,
        )
```

## Unified search (email + SMS)

```python
# Search across BOTH email and SMS history with one query
results = client.search.threads(
    query="customer asking about delivery",
    inbox_id=INBOX_ID,
)
# Returns matching threads from both email and SMS, ranked by semantic similarity
```

## Capability reference

| Capability | Method | Notes |
|-----------|--------|-------|
| Send SMS | `client.sms.send(to, body, phone_number_id)` | Returns message_id, thread_id, credits_charged |
| Receive webhook | `POST /webhook/sms` | See payload above |
| Conversation history | `client.sms.thread(remote_number, phone_number_id)` | Full history, ordered oldest-first |
| Semantic search | `client.sms.search(q, phone_number_id, limit)` | Vector search across all SMS content |
| Opt-out management | `client.sms.suppressions(phone_number_id)` | Returns numbers that sent STOP |
| MMS | `client.sms.send(..., media_url="https://...")` | Attach images or files |
| Auto-reply | `client.phone_numbers.update(id, auto_reply="...")` | Set a default auto-reply message |
| Allow / block lists | `client.phone_numbers.update(..., allow_list=[...], block_list=[...])` | Per-number access control |

## Examples in this folder

| File | Description |
|------|-------------|
| `provision_and_send.py` | Get a number and send first SMS |
| `two_way_sms_agent.py` | Receive SMS, process with LLM, reply |
| `email_sms_escalation.py` | Escalate from email to SMS after no reply |
| `mass_sms_campaign.py` | Send to a list with deduplication |

## Related

- [Email examples](../langchain/) — email-first workflows
- [capabilities/sms/](../capabilities/sms/) — full API reference for all SMS methods
- [use-cases/hiring-and-recruiting/](../use-cases/hiring-and-recruiting/) — end-to-end hiring workflows
