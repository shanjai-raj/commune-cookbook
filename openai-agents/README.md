# OpenAI Agents SDK + Commune — Email as Agent Tools

Add email and SMS to OpenAI Agents SDK agents using `@function_tool`. The agent decides when to read, search, and reply — you just wire the tools.

## Install

```bash
pip install commune-mail openai-agents
export COMMUNE_API_KEY="comm_..."
export OPENAI_API_KEY="sk-..."
```

## Tool definitions

```python
from agents import Agent, Runner, function_tool
from commune import CommuneClient

client = CommuneClient(api_key=os.environ["COMMUNE_API_KEY"])
INBOX_ID = "i_your_inbox_id"

@function_tool
def read_inbox(limit: int = 10) -> str:
    """Read the most recent email threads. Use at the start of a session to check for new messages."""
    threads = client.threads.list(inbox_id=INBOX_ID, limit=limit)
    return "\n".join([f"[{t.thread_id}] {t.subject} from {t.last_sender}: {t.snippet}" for t in threads.data])

@function_tool
def get_thread(thread_id: str) -> str:
    """Get the full message history for a specific thread. Use before replying to understand full context."""
    messages = client.threads.messages(thread_id)
    return "\n---\n".join([f"From: {m.sender}\n{m.content}" for m in messages])

@function_tool
def reply_to_thread(thread_id: str, message: str, recipient: str) -> str:
    """Reply to an email thread. Always use this for responses — it keeps the conversation threaded."""
    client.messages.send(to=recipient, text=message, inbox_id=INBOX_ID, thread_id=thread_id)
    return f"Reply sent in thread {thread_id}"

@function_tool
def search_history(query: str) -> str:
    """Semantic search across all email history. Use before replying to retrieve past context about a customer."""
    results = client.search.threads(query=query, inbox_id=INBOX_ID, limit=5)
    return "\n".join([f"- {r.subject}: {r.snippet}" for r in results.data])

@function_tool
def escalate_to_human(thread_id: str, reason: str) -> str:
    """Escalate a thread to a human agent. Use when the issue is too complex, involves a refund, or the customer is distressed."""
    client.messages.send(
        to="humans@yourcompany.com",
        subject=f"[Escalation] Thread {thread_id}",
        text=f"Escalated for human review.\n\nReason: {reason}\n\nThread ID: {thread_id}",
        inbox_id=INBOX_ID,
    )
    return f"Thread {thread_id} escalated"

support_agent = Agent(
    name="Email Support Agent",
    instructions="""You are a customer support agent with access to a real email inbox.

Always: search history before replying, use reply_to_thread (not a new email) for responses,
maintain thread context by reading the full thread before drafting a reply.
Escalate to human when the issue is beyond your scope.""",
    tools=[read_inbox, get_thread, reply_to_thread, search_history, escalate_to_human],
    model="gpt-4o",
)
```

## Handoff pattern

The Agents SDK supports agent handoffs natively. Route from a triage agent to a specialist:

```python
from agents import Agent, handoff

specialist_agent = Agent(
    name="Billing Specialist",
    instructions="You handle billing disputes and refund requests. You have full account access.",
    tools=[get_thread, reply_to_thread],
    model="gpt-4o",
)

triage_agent = Agent(
    name="Triage Agent",
    instructions="You classify support tickets. Route billing issues to the billing specialist.",
    tools=[read_inbox, get_thread],
    handoffs=[handoff(specialist_agent)],
    model="gpt-4o",
)
```

## Running with a webhook

```python
from fastapi import FastAPI, Request
from agents import Runner

app = FastAPI()

@app.post("/webhook")
async def handle_email(request: Request):
    payload = await request.json()

    result = await Runner.run(
        support_agent,
        f"New email in thread {payload['thread_id']} from {payload['sender']}: {payload['content']}"
    )
    return {"ok": True}
```

## Examples in this folder

| File | Description |
|------|-------------|
| `customer_support_agent.py` | Support agent with human escalation handoff |
| `async_email_agent.py` | Async agent with parallel inbox processing |

## Tips

- Return descriptive strings from tools — the model reads them to decide next steps
- Include `thread_id` in every `reply_to_thread` call; enforce it in the docstring
- Use `escalate_to_human` as an explicit exit ramp — prevents the model from looping on unresolvable issues
- Set `model="gpt-4o"` for complex multi-step workflows; `gpt-4o-mini` for high-volume simpler tasks

## Related

- [LangChain examples](../langchain/) — `@tool` decorator pattern
- [Claude examples](../claude/) — tool_use API integration
