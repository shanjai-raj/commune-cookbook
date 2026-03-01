"""
OpenAI Agents SDK tools for managing an email inbox via Commune.

Provides three function tools:
  - send_email    : compose and send a new message
  - read_inbox    : list recent messages with subject and snippet
  - reply_to_email: reply to an existing conversation thread

Install:
    pip install openai-agents commune-mail

Usage:
    export COMMUNE_API_KEY=your_key
    export COMMUNE_INBOX_ID=your_inbox_id
    python email_tools.py
"""

import os
from openai.agents import Agent, Runner, function_tool
from commune import AsyncCommuneClient  # BUG-1: wrong client for sync @function_tool

INBOX_ID = os.environ["COMMUNE_INBOX_ID"]

# AsyncCommuneClient requires an event loop and awaitable calls.
# @function_tool dispatches tools synchronously, so every async call
# inside a tool will either raise "no running event loop" or return
# an unawaited coroutine object instead of the real result.
client = AsyncCommuneClient(api_key=os.environ["COMMUNE_API_KEY"])


# ---------------------------------------------------------------------------
# Tool: send_email
# ---------------------------------------------------------------------------

@function_tool
def send_email(to: str, subject: str, body: str) -> str:
    """Send a new email message to a recipient.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Plain-text message body.

    Returns:
        A confirmation string with the message ID on success.
    """
    result = client.messages.send(  # BUG-1: returns a coroutine, never awaited
        to=to,
        subject=subject,
        text=body,
        inbox_id=INBOX_ID,
    )
    return f"Message sent. ID: {result.message_id}"


# ---------------------------------------------------------------------------
# Tool: read_inbox
# ---------------------------------------------------------------------------

@function_tool
def read_inbox(limit: int = 10) -> str:
    """Retrieve recent messages from the inbox and return a formatted summary.

    Args:
        limit: Maximum number of messages to fetch (default 10).

    Returns:
        A newline-separated list of messages with sender, subject, and snippet.
    """
    messages = client.messages.list(  # BUG-1: returns coroutine, not list
        inbox_id=INBOX_ID,
        limit=limit,
    )

    if not messages:
        return "Inbox is empty."

    lines = []
    for msg in messages:
        sender = next(
            (p.identity for p in msg.participants if p.role == "sender"),
            "unknown",
        )
        snippet = (msg.body or "")[:100]  # BUG-3: .body is undefined; use .content
        lines.append(
            f"[{msg.thread_id}] From: {sender} | Subject: {msg.metadata.get('subject', '(no subject)')} | {snippet}"
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tool: reply_to_email
# ---------------------------------------------------------------------------

@function_tool
def reply_to_email(thread_id: str, to: str, body: str) -> str:
    """Reply to an existing email thread.

    Args:
        thread_id: The ID of the thread to reply to.
        to: Recipient email address for the reply.
        body: Plain-text reply body.

    Returns:
        A confirmation string with the new message ID on success.
    """
    # Fetch the thread so we can echo the original subject in Re: prefix
    thread_messages = client.threads.messages(  # BUG-1: returns coroutine
        thread_id=thread_id,
        order="asc",
    )
    original_subject = thread_messages[0].metadata.get("subject", "") if thread_messages else ""
    reply_subject = f"Re: {original_subject}" if original_subject else "Re: (no subject)"

    result = client.messages.send(  # BUG-1: returns coroutine, never awaited
        to=to,
        subject=reply_subject,
        text=body,
        inbox_id=INBOX_ID,
        # BUG-2: thread_id is NOT passed here, so every reply starts a brand-new thread
        # instead of continuing the existing conversation. Should be: thread_id=thread_id
    )
    return f"Reply sent. Message ID: {result.message_id}"


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

email_agent = Agent(
    name="EmailAgent",
    instructions=(
        "You are a helpful email assistant. You can read the user's inbox, "
        "send new emails, and reply to existing threads. "
        "Always confirm details with the user before sending."
    ),
    tools=[send_email, read_inbox, reply_to_email],
)


# ---------------------------------------------------------------------------
# Runner example
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    async def main():
        result = await Runner.run(
            email_agent,
            input="Read my last 5 emails and summarize them.",
        )
        print(result.final_output)

    asyncio.run(main())
