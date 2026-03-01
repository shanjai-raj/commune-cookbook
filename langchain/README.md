# LangChain + Commune — Email & SMS for Your Agents

Give your LangChain agents a real inbox. Email becomes a first-class tool in your chain — send, receive, search, and reply in thread using the `@tool` decorator.

## How it works

```
LangChain Agent
    ↓ uses @tool
send_email() → Commune → recipient's inbox
read_inbox()  ← Commune ← inbound webhook fires
search_threads() → vector search across history
reply_in_thread() → RFC 5322 threaded reply
```

## Install

```bash
pip install commune-mail langchain langchain-openai
export COMMUNE_API_KEY="comm_..."
export OPENAI_API_KEY="sk-..."
```

## Tools

Wrap Commune as LangChain tools with the `@tool` decorator:

```python
from commune import CommuneClient
from langchain.tools import tool

client = CommuneClient(api_key=os.environ["COMMUNE_API_KEY"])

@tool
def read_inbox(inbox_id: str, limit: int = 10) -> str:
    """Read recent email threads from an agent inbox. Returns subject, sender, snippet, and thread_id for each thread."""
    threads = client.threads.list(inbox_id=inbox_id, limit=limit)
    return "\n".join([
        f"Thread {t.thread_id}: '{t.subject}' from {t.last_sender} — {t.snippet}"
        for t in threads.data
    ])

@tool
def reply_in_thread(thread_id: str, inbox_id: str, message: str) -> str:
    """Reply to an existing email thread. Use this to respond to customer messages while keeping conversation grouped."""
    client.messages.send(
        to=get_thread_sender(thread_id),  # helper to get original sender
        text=message,
        inbox_id=inbox_id,
        thread_id=thread_id,
    )
    return f"Reply sent in thread {thread_id}"

@tool
def search_email_history(query: str, inbox_id: str) -> str:
    """Search email history with natural language. Use before replying to retrieve context about a customer or issue."""
    results = client.search.threads(query=query, inbox_id=inbox_id, limit=5)
    return "\n".join([f"- {r.subject}: {r.snippet}" for r in results.data])

@tool
def send_new_email(to: str, subject: str, body: str, inbox_id: str) -> str:
    """Send a new email (not a reply). Use for outreach, notifications, and proactive communication."""
    client.messages.send(to=to, subject=subject, text=body, inbox_id=inbox_id)
    return f"Email sent to {to}"
```

## Agent setup

```python
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [read_inbox, reply_in_thread, search_email_history, send_new_email]

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a customer support agent with access to a real email inbox.

When you receive a customer email:
1. Search email history for context about this customer
2. Read the full thread to understand the issue
3. Draft an empathetic, accurate reply
4. Send the reply in the same thread (always use reply_in_thread, not send_new_email)

Always maintain a professional, helpful tone. Escalate complex billing or legal issues."""),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_openai_functions_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
```

## Webhook handler (receive inbound email → run agent)

```python
from flask import Flask, request, jsonify
from commune import verify_signature

app = Flask(__name__)

@app.post("/webhook/commune")
def handle_inbound_email():
    # Verify the webhook signature first
    verify_signature(
        payload=request.get_data(),
        signature=request.headers.get("x-commune-signature"),
        secret=os.environ["COMMUNE_WEBHOOK_SECRET"],
        timestamp=request.headers.get("x-commune-timestamp"),
    )

    payload = request.json
    inbox_id = payload["inboxId"]
    thread_id = payload["thread_id"]
    sender = payload["sender"]
    content = payload["content"]

    # Run the agent
    result = executor.invoke({
        "input": f"New email from {sender} in thread {thread_id}: {content}\nInbox ID: {inbox_id}"
    })

    return jsonify({"ok": True})
```

## Examples in this folder

| File | Description |
|------|-------------|
| `customer_support_agent.py` | Full support workflow: classify → search history → reply |
| `lead_outreach_agent.py` | Personalized outreach with open tracking |
| `async_support_agent.py` | Async version using AsyncCommuneClient |

## TypeScript version

See [../typescript/](../typescript/) for the equivalent patterns using `commune-ai`.

## Related

- [CrewAI examples](../crewai/) — multi-agent coordination with role-based crews
- [Semantic search capability](../capabilities/semantic-search/) — deep dive on vector search
