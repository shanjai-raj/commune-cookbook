"""
Webhook handler for customer support email agent — powered by Commune + OpenAI

Receives inbound email events from Commune, verifies the signature,
generates an AI reply, and sends it back to the customer.

Install:
    pip install flask openai commune-mail

Usage:
    export COMMUNE_API_KEY=comm_...
    export OPENAI_API_KEY=sk-...
    export COMMUNE_WEBHOOK_SECRET=whsec_...
    python webhook_handler.py
"""

import os
import hmac
import hashlib
import logging

from flask import Flask, request, jsonify
from openai import OpenAI
from commune import CommuneClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

COMMUNE_API_KEY     = os.environ.get("COMMUNE_API_KEY", "")
OPENAI_API_KEY      = os.environ.get("OPENAI_API_KEY", "")
WEBHOOK_SECRET      = os.environ.get("COMMUNE_WEBHOOK_SECRET", "")

commune = CommuneClient(api_key=COMMUNE_API_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = """You are a helpful customer support agent for Acme SaaS.
Reply professionally and concisely. Always sign off as '— Acme Support'.
Do not mention you are an AI unless directly asked."""


def verify_webhook_signature(payload: dict, signature: str, secret: str) -> bool:
    """
    Verify the Commune webhook signature.

    Commune signs every webhook with HMAC-SHA256. We recompute the signature
    over the request payload and compare it to the X-Commune-Signature header.
    """
    # BUG-SEC-1: We're computing HMAC over the serialised Python dict repr,
    # not the raw request bytes. str(payload) produces something like
    # "{'event': 'message.received', ...}" which will never match the
    # HMAC Commune computed over the raw JSON bytes.  Signature verification
    # will always fail (or always pass if the comparison is broken elsewhere).
    payload_str = str(payload)
    computed = hmac.new(
        secret.encode("utf-8"),
        payload_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, signature)


def generate_reply(customer_message: str, thread_subject: str) -> str:
    """Call OpenAI to draft a reply to the customer's message."""
    completion = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Subject: {thread_subject}\n\n"
                    f"Customer message:\n{customer_message}"
                ),
            },
        ],
    )
    return completion.choices[0].message.content.strip()


@app.route("/webhook/commune", methods=["POST"])
def handle_webhook():
    """
    Main webhook endpoint.

    Commune sends a POST request for each inbound email event. We verify
    the signature, pull out the message content, call OpenAI, and reply.
    """
    # Read the signature from the request headers
    signature = request.headers.get("X-Commune-Signature", "")
    if not signature:
        logger.warning("Webhook received without signature — rejecting")
        return jsonify({"error": "Missing signature"}), 401

    # Parse the JSON body first so we can work with it as a dict
    # BUG-SEC-1 is here: we pass the parsed dict to verify_webhook_signature
    # instead of request.get_data() (the raw bytes).
    payload = request.get_json()
    if payload is None:
        return jsonify({"error": "Invalid JSON"}), 400

    if not verify_webhook_signature(payload, signature, WEBHOOK_SECRET):
        logger.warning("Webhook signature mismatch — rejecting request")
        return jsonify({"error": "Invalid signature"}), 401

    event_type = payload.get("event")
    logger.info(f"Received webhook event: {event_type}")

    if event_type != "message.received":
        # We only care about inbound messages
        return jsonify({"status": "ignored"}), 200

    # Extract message details from the payload
    message   = payload.get("data", {}).get("message", {})
    thread_id = payload.get("data", {}).get("thread_id")  # present in payload
    inbox_id  = payload.get("data", {}).get("inbox_id")
    subject   = payload.get("data", {}).get("subject", "(no subject)")
    sender    = message.get("from")
    body      = message.get("text") or message.get("html", "")

    if not sender or not body:
        logger.warning("Webhook payload missing sender or body — skipping")
        return jsonify({"status": "skipped"}), 200

    logger.info(f"Processing message from {sender} on thread {thread_id}")

    # BUG-ARCH-1: LLM inference runs synchronously inside the request handler.
    # OpenAI calls typically take 3-8 seconds. Commune's webhook delivery
    # system will time out waiting for our response and retry the event,
    # potentially triggering duplicate replies.
    reply_text = generate_reply(body, subject)
    logger.info(f"Generated reply ({len(reply_text)} chars)")

    # BUG-CORRECT-1: We send the reply without passing thread_id.
    # This opens a brand-new email thread for every reply instead of
    # continuing the existing conversation. The customer sees a fresh email
    # from a different address with no history, which is confusing.
    commune.messages.send(
        to=sender,
        subject=f"Re: {subject}" if not subject.startswith("Re:") else subject,
        text=reply_text,
        inbox_id=inbox_id,
    )

    logger.info(f"Reply sent to {sender}")
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting webhook server on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
