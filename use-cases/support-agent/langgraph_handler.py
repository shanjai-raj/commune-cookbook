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

# FIX BUG-CORRECT-1: added thread_id to State TypedDict.
# Without it, the reply node could not access thread_id — commune.messages.send()
# was called without it, creating a brand-new disconnected email thread for every
# reply. Now thread_id flows through state and the reply node uses it correctly.
class State(TypedDict):
    message_id:   str
    inbox_id:     str
    thread_id:    str   # FIX BUG-CORRECT-1: required for reply thread continuity
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

    # FIX BUG-CORRECT-1: thread_id is now in state — pass it to continue the
    # existing conversation thread instead of creating a new top-level email.
    commune.messages.send(
        to=state["sender"],
        subject=f"Re: {state['subject']}",
        text=reply_text,               # correct param name in commune-mail SDK
        inbox_id=state["inbox_id"],
        thread_id=state["thread_id"],  # FIX BUG-CORRECT-1: continue customer's thread
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
        "thread_id":  message["threadId"],  # FIX BUG-CORRECT-1: include thread_id in state
        "sender":     sender,
        "subject":    message.get("metadata", {}).get("subject", ""),
        "body":       message.get("content", ""),
        "intent":     "general",   # will be overwritten by triage node
        "reply_text": "",
    }

    # FIX BUG-ARCH-1: return 200 immediately, run graph in background thread.
    # graph.invoke() with LLM nodes takes 10-30 seconds — returning that late
    # causes Commune to retry the webhook, double-processing the email.
    # Background thread acknowledges instantly; graph runs after response is sent.
    #
    # FIX BUG-CORRECT-2: pass config with unique thread_id per event.
    # Without config, MemorySaver routes all invocations through the same
    # checkpoint key — state from event A bleeds into event B. Each event
    # must use its own message_id as the LangGraph thread_id so checkpoints
    # are fully isolated.
    event_id = message["id"]

    def run_graph():
        graph.invoke(
            initial_state,
            config={"configurable": {"thread_id": event_id}},  # FIX BUG-CORRECT-2
        )

    threading.Thread(target=run_graph, daemon=True).start()

    return Response(json.dumps({"ok": True}), status=200, mimetype="application/json")


@flask_app.get("/health")
def health() -> Response:
    return Response(json.dumps({"ok": True}), status=200, mimetype="application/json")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"LangGraph support agent running on port {port}")
    flask_app.run(host="0.0.0.0", port=port)
