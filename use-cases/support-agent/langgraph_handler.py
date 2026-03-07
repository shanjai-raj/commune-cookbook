"""
LangGraph Support Agent — Commune Email Webhook Handler

Multi-step support agent built with LangGraph. Each inbound email triggers
a stateful graph that:
  1. Classifies the customer intent (triage node)
  2. Looks up account context if needed (context node)
  3. Drafts and sends a professional reply (reply node)

State is checkpointed so that long-running threads survive process restarts.

Install:
    pip install commune-mail langgraph langchain-openai flask

Environment:
    COMMUNE_API_KEY         — from commune.email dashboard
    COMMUNE_WEBHOOK_SECRET  — set when registering the webhook
    OPENAI_API_KEY          — for LLM nodes
    COMMUNE_INBOX_ID        — inbox to read/reply from

Usage:
    python langgraph_handler.py
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
from typing import Literal, TypedDict

from commune import CommuneClient
from flask import Flask, Response, request
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

# ── Clients ────────────────────────────────────────────────────────────────

commune = CommuneClient(api_key=os.environ["COMMUNE_API_KEY"])
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# ── Graph state ────────────────────────────────────────────────────────────

# BUG-CORRECT-1: thread_id is NOT included in the State TypedDict.
# The webhook handler extracts it from the payload and passes it via the
# initial state, but LangGraph nodes cannot access fields not declared here.
# When the reply node calls commune.messages.send(), it has no thread_id,
# so it omits it — every reply creates a brand-new disconnected email thread
# instead of continuing the customer's conversation.
# Fix: add  thread_id: str  to this TypedDict.
class State(TypedDict):
    message_id:   str
    inbox_id:     str
    sender:       str
    subject:      str
    body:         str
    intent:       Literal["billing", "technical", "general", "spam"]
    reply_text:   str


# ── Graph nodes ────────────────────────────────────────────────────────────

def triage_node(state: State) -> dict:
    """Classify the intent of the inbound email."""
    prompt = f"""Classify this support email into one of: billing, technical, general, spam.

Subject: {state['subject']}
Body: {state['body']}

Return JSON: {{"intent": "<class>"}}"""

    result = llm.invoke(prompt)
    parsed = json.loads(result.content)
    print(f"[triage] intent={parsed['intent']}")
    return {"intent": parsed["intent"]}


def reply_node(state: State) -> dict:
    """Draft and send a reply to the customer."""
    if state["intent"] == "spam":
        print("[reply] Skipping spam")
        return {"reply_text": ""}

    system_map = {
        "billing":   "You are a billing support specialist. Be empathetic and precise.",
        "technical": "You are a senior technical support engineer. Provide concrete steps.",
        "general":   "You are a helpful support agent. Reply concisely and professionally.",
    }
    system_prompt = system_map.get(state["intent"], system_map["general"])

    draft = llm.invoke(
        f"{system_prompt}\n\nCustomer email:\n{state['body']}\n\nWrite a professional reply. Sign off as 'Support Team'."
    )
    reply_text = draft.content

    # BUG-CORRECT-1 surface: thread_id not available in state — send() called
    # without it, so each reply opens a new thread.
    commune.messages.send(
        to=state["sender"],
        subject=f"Re: {state['subject']}",
        body=reply_text,               # note: correct param is `text` in commune-mail
        inbox_id=state["inbox_id"],
        # thread_id=state["thread_id"]  — would be here if state included it
    )

    print(f"[reply] Sent to {state['sender']}")
    return {"reply_text": reply_text}


# ── Build graph ────────────────────────────────────────────────────────────

checkpointer = MemorySaver()

builder = StateGraph(State)
builder.add_node("triage", triage_node)
builder.add_node("reply",  reply_node)
builder.set_entry_point("triage")
builder.add_edge("triage", "reply")
builder.add_edge("reply",  END)

# BUG-CORRECT-2: MemorySaver is used as checkpointer but graph.invoke() is
# called without a config that includes {"configurable": {"thread_id": ...}}.
# Without a unique thread_id per webhook event, LangGraph routes all invocations
# through the same checkpoint key — state from event A is visible to event B.
# For example, if event A sets intent="billing" and event B is a "technical"
# email, event B may start with intent="billing" already populated, causing
# the triage node's output to be merged incorrectly.
# Fix: pass config={"configurable": {"thread_id": event.message_id}} to
# graph.invoke() so each webhook event gets its own isolated checkpoint.
graph = builder.compile(checkpointer=checkpointer)


# ── Flask webhook ──────────────────────────────────────────────────────────

flask_app = Flask(__name__)


def _verify_signature(raw_body: bytes, signature: str) -> bool:
    secret = os.environ.get("COMMUNE_WEBHOOK_SECRET", "")
    expected = hmac.new(
        secret.encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature.removeprefix("sha256="))


@flask_app.post("/webhook")
def webhook() -> Response:
    raw_body = request.get_data()
    sig = request.headers.get("X-Commune-Signature", "")

    if not _verify_signature(raw_body, sig):
        return Response(json.dumps({"error": "Invalid signature"}), status=401,
                        mimetype="application/json")

    event = request.json
    message = event.get("message", {})

    if message.get("direction") != "inbound":
        return Response(json.dumps({"ok": True}), status=200, mimetype="application/json")

    sender = next(
        (p["identity"] for p in message.get("participants", []) if p["role"] == "sender"),
        None,
    )
    if not sender:
        return Response(json.dumps({"ok": True}), status=200, mimetype="application/json")

    initial_state: State = {
        "message_id": message["id"],
        "inbox_id":   event["inboxId"],
        "sender":     sender,
        "subject":    message.get("metadata", {}).get("subject", ""),
        "body":       message.get("content", ""),
        "intent":     "general",   # will be overwritten by triage node
        "reply_text": "",
        # thread_id from message["threadId"] is NOT included — BUG-CORRECT-1
    }

    # BUG-ARCH-1: graph.invoke() is called synchronously inside the webhook
    # handler. A LangGraph graph with LLM calls (triage + reply) takes 10-30
    # seconds to complete. Commune's webhook delivery expects a response within
    # ~5 seconds; a slow response triggers retries, which will double-process
    # the email. For high-traffic inboxes this blocks the Flask worker thread
    # for the full duration, reducing throughput to ~2 req/s per worker.
    # Fix: acknowledge with 200 immediately, then run the graph in a background
    # thread (or better: a task queue like Celery or BullMQ).
    graph.invoke(
        initial_state,
        # BUG-CORRECT-2: no config passed — all events share the same checkpoint key
    )

    return Response(json.dumps({"ok": True}), status=200, mimetype="application/json")


@flask_app.get("/health")
def health() -> Response:
    return Response(json.dumps({"ok": True}), status=200, mimetype="application/json")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"LangGraph support agent running on port {port}")
    flask_app.run(host="0.0.0.0", port=port)
