# Claude + Commune — Email Tools via tool_use API

Use Commune with Claude's `tool_use` API directly. Define tools, handle `tool_use` blocks, return `tool_result` — Commune becomes part of Claude's reasoning loop.

## Install

```bash
pip install commune-mail anthropic
export COMMUNE_API_KEY="comm_..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Tool definitions

```python
import anthropic
from commune import CommuneClient

client = CommuneClient(api_key=os.environ["COMMUNE_API_KEY"])

TOOLS = [
    {
        "name": "read_inbox",
        "description": "Read recent email threads from the agent inbox. Returns subject, sender, and snippet for each thread.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Number of threads to return (default 10)"},
            }
        }
    },
    {
        "name": "get_thread",
        "description": "Get the full message history for a thread. Use before replying to understand the full context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "thread_id": {"type": "string", "description": "Thread ID from read_inbox"},
            },
            "required": ["thread_id"]
        }
    },
    {
        "name": "reply_in_thread",
        "description": "Send a reply within an existing thread. This keeps the conversation grouped in the recipient's email client.",
        "input_schema": {
            "type": "object",
            "properties": {
                "thread_id": {"type": "string"},
                "recipient": {"type": "string", "description": "Email address of recipient"},
                "message": {"type": "string", "description": "Reply text"},
            },
            "required": ["thread_id", "recipient", "message"]
        }
    },
    {
        "name": "search_history",
        "description": "Search email history with a natural language query. Use before replying to retrieve context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"]
        }
    }
]
```

## Tool execution loop

```python
def run_tool(name: str, inputs: dict) -> str:
    if name == "read_inbox":
        threads = client.threads.list(inbox_id=INBOX_ID, limit=inputs.get("limit", 10))
        return "\n".join([f"[{t.thread_id}] {t.subject}: {t.snippet}" for t in threads.data])
    elif name == "get_thread":
        msgs = client.threads.messages(inputs["thread_id"])
        return "\n---\n".join([f"From {m.sender}:\n{m.content}" for m in msgs])
    elif name == "reply_in_thread":
        client.messages.send(
            to=inputs["recipient"],
            text=inputs["message"],
            inbox_id=INBOX_ID,
            thread_id=inputs["thread_id"],
        )
        return "Reply sent"
    elif name == "search_history":
        results = client.search.threads(query=inputs["query"], inbox_id=INBOX_ID)
        return "\n".join([f"- {r.subject}: {r.snippet}" for r in results.data])

claude = anthropic.Anthropic()

def process_email(sender: str, content: str, thread_id: str) -> str:
    messages = [{"role": "user", "content": f"New email from {sender} in thread {thread_id}: {content}"}]

    while True:
        response = claude.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            tools=TOOLS,
            messages=messages,
            system="You are a customer support agent. Always search history before replying. Reply in thread, never start a new email."
        )

        if response.stop_reason == "end_turn":
            return next(b.text for b in response.content if b.type == "text")

        # Handle tool_use blocks
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = run_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
```

## Structured extraction

Define a JSON schema on your inbox and Claude can query pre-extracted data instead of parsing raw email text:

```python
# Set a schema on the inbox once
client.inboxes.update(INBOX_ID, extraction_schema={
    "type": "object",
    "properties": {
        "order_id":   {"type": "string"},
        "issue_type": {"type": "string", "enum": ["damaged", "missing", "wrong_item", "refund"]},
        "urgency":    {"type": "string", "enum": ["low", "medium", "high"]},
    },
})

# Every inbound message now has .extracted populated automatically
# Add a tool so Claude can query structured data directly:
{
    "name": "get_extracted_data",
    "description": "Get the structured data auto-extracted from an email by the inbox schema.",
    "input_schema": {
        "type": "object",
        "properties": {
            "message_id": {"type": "string"}
        },
        "required": ["message_id"],
    },
}

# Handler:
# msg = client.messages.get(inputs["message_id"])
# return json.dumps(msg.extracted, indent=2)
```

## Examples in this folder

| File | Description |
|------|-------------|
| `customer_support_agent.py` | Full support loop with tool_use |
| `lead_outreach_agent.py` | Personalized cold email writer |
| `structured_extraction_agent.py` | Schema-based email parsing |

## Tips

- Keep tool descriptions precise — Claude uses them verbatim to decide when to call each tool
- Enforce required fields like `thread_id` in the schema's `"required"` array
- Use `claude-opus-4-6` for complex multi-step workflows; `claude-haiku-3-5` for high-volume simpler classification
- Log tool calls during development — the reasoning trace is invaluable for debugging

## Related

- [MCP server](../mcp-server/) — use Commune in Claude Desktop without code
- [LangChain examples](../langchain/) — @tool decorator pattern
