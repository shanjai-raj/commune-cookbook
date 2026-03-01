# CrewAI + Commune — Multi-Agent Email Coordination

Build crews where agents coordinate through email. Each agent has its own dedicated inbox. Communication leaves a full audit trail in thread history.

## Architecture

```
                    inbound email
                         ↓
              triage@company.com
              [Triage Agent]
                  /         \
                 /           \
    billing@company.com   tech@company.com
    [Billing Agent]       [Tech Agent]
                 \           /
                  \         /
              qa@company.com
              [QA Agent]
                    ↓
              reply sent in original thread
```

## Install

```bash
pip install commune-mail crewai crewai-tools
export COMMUNE_API_KEY="comm_..."
export OPENAI_API_KEY="sk-..."
```

## Tools

Define Commune operations as CrewAI `BaseTool` subclasses:

```python
from crewai_tools import BaseTool
from commune import CommuneClient
from pydantic import BaseModel, Field

client = CommuneClient(api_key=os.environ["COMMUNE_API_KEY"])

class ReadInboxInput(BaseModel):
    inbox_id: str = Field(description="The inbox ID to read threads from")
    limit: int = Field(default=5, description="Number of threads to return")

class ReadInboxTool(BaseTool):
    name: str = "read_inbox"
    description: str = "Read recent email threads from an agent inbox. Use to check for new messages."
    args_schema: type[BaseModel] = ReadInboxInput

    def _run(self, inbox_id: str, limit: int = 5) -> str:
        threads = client.threads.list(inbox_id=inbox_id, limit=limit)
        return "\n".join([f"[{t.thread_id}] {t.subject}: {t.snippet}" for t in threads.data])

class ReplyInThreadTool(BaseTool):
    name: str = "reply_in_thread"
    description: str = "Reply to an existing email thread. Always use this instead of send_email when responding to a customer."

    def _run(self, thread_id: str, inbox_id: str, message: str, recipient: str) -> str:
        client.messages.send(to=recipient, text=message, inbox_id=inbox_id, thread_id=thread_id)
        return "Reply sent"
```

## Crew definition

```python
from crewai import Agent, Task, Crew, Process

# Create dedicated inboxes for each agent role
triage_inbox = client.inboxes.create(local_part="triage")
billing_inbox = client.inboxes.create(local_part="billing")
tech_inbox = client.inboxes.create(local_part="tech-support")

triage_agent = Agent(
    role="Email Triage Specialist",
    goal="Read inbound emails, classify by type (billing/technical/general), and route to the correct specialist inbox",
    backstory="You are an expert at quickly understanding customer issues and routing them efficiently.",
    tools=[ReadInboxTool(), ClassifyEmailTool(), ForwardToInboxTool()],
)

billing_agent = Agent(
    role="Billing Support Specialist",
    goal="Resolve billing questions, process refunds, explain charges",
    backstory="You handle all financial matters with accuracy and empathy.",
    tools=[ReadInboxTool(), ReplyInThreadTool(), SearchHistoryTool()],
)

triage_task = Task(
    description="Check the triage inbox for new emails. For each new thread, classify the issue type and route to the appropriate specialist.",
    agent=triage_agent,
    expected_output="List of threads routed with their classification and destination",
)

billing_task = Task(
    description="Check the billing inbox for threads routed by triage. Read each thread fully, search customer history, and send a complete reply.",
    agent=billing_agent,
    context=[triage_task],  # billing_task has context from triage
    expected_output="Confirmation of replies sent with thread IDs",
)

crew = Crew(
    agents=[triage_agent, billing_agent],
    tasks=[triage_task, billing_task],
    process=Process.sequential,
    verbose=True,
)
```

## Multi-agent coordination pattern

Agents hand off work to each other over email — useful for long-running tasks that span multiple agent runs:

```python
@tool("Assign Task to Agent")
def assign_task(to_inbox: str, task_description: str, context: str) -> str:
    """Assign a task to another agent by sending an email to their inbox."""
    msg = client.messages.send(
        to=to_inbox,
        subject=f"Task: {task_description[:60]}",
        text=f"Task:\n{task_description}\n\nContext:\n{context}",
        inbox_id=INBOX_ID,
    )
    return f"Task assigned. Thread ID for tracking: {msg.thread_id}"
```

Each agent monitors its own inbox, picks up assigned tasks, and replies into the thread when done — creating an auditable, async workflow over email.

## Examples in this folder

| File | Description |
|------|-------------|
| `customer_support_crew.py` | Triage → specialist → QA pipeline |
| `lead_outreach_crew.py` | Researcher + writer + sender crew |
| `multi_agent_coordination.py` | Agents handoff subtasks via email threads |

## Tips

- Use `Process.sequential` for simple pipelines; `Process.hierarchical` for manager-worker patterns
- Give each tool a clear name string — this is what the LLM sees in its reasoning
- Scope tools to inboxes: create separate inboxes per agent role for clean separation
- Pass `context=[triage_task]` to downstream tasks so the output flows automatically

## Related

- [LangChain examples](../langchain/) — single-agent patterns with @tool
- [OpenAI Agents examples](../openai-agents/) — function_tool patterns
