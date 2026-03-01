# TypeScript + Commune — Email for Node.js Agents

Full TypeScript support with `commune-ai`. Webhook handlers with HMAC verification, typed payloads, and async/await throughout.

## Install

```bash
npm install commune-ai
export COMMUNE_API_KEY="comm_..."
```

## Webhook handler (Express)

```typescript
import express, { Request, Response } from "express";
import { CommuneClient, verifyCommuneWebhook, CommuneWebhookEvent } from "commune-ai";

const commune = new CommuneClient({ apiKey: process.env.COMMUNE_API_KEY! });
const app = express();

// IMPORTANT: Use express.raw() — not express.json() — for webhook routes.
// HMAC verification requires the raw request body before parsing.
app.post(
    "/webhook/commune",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
        let event: CommuneWebhookEvent;
        try {
            event = verifyCommuneWebhook(
                req.body,
                req.headers["commune-signature"] as string,
                process.env.COMMUNE_WEBHOOK_SECRET!,
            );
        } catch (err) {
            console.error("Webhook signature verification failed:", err);
            return res.status(400).json({ error: "Invalid signature" });
        }

        // Acknowledge immediately — Commune retries if it doesn't get 200 within 10s
        res.sendStatus(200);

        // Process asynchronously after responding
        setImmediate(() => handleEvent(event).catch(console.error));
    }
);

async function handleEvent(event: CommuneWebhookEvent): Promise<void> {
    switch (event.type) {
        case "message.received": {
            const { thread_id, from_address, text, inbox_id } = event.data;

            // Get full thread history
            const messages = await commune.threads.messages(thread_id);
            const history = messages.map(m => `${m.from_address}: ${m.text}`).join("\n\n");

            // Search for similar past cases
            const similar = await commune.search.threads({
                query: text,
                inboxId: inbox_id,
                limit: 3,
            });

            // Your agent logic here — call OpenAI, Claude, etc.
            const reply = await yourAgent.generateReply(history, similar);

            // Reply in same thread
            await commune.messages.send({
                to: from_address,
                subject: `Re: ${event.data.subject}`,
                text: reply,
                inboxId: inbox_id,
                threadId: thread_id,
            });

            await commune.threads.setStatus(thread_id, "resolved");
            break;
        }

        case "sms.received": {
            const { phone_number_id, from_number, body } = event.data;
            // Handle inbound SMS...
            break;
        }
    }
}

app.listen(3000, () => console.log("Webhook server running on :3000"));
```

## Multi-agent coordination

```typescript
// Agent A finishes a task, emails Agent B
await commune.messages.send({
    to: "agent-b@company.commune.email",
    subject: "Task: analyze customer segment",
    text: JSON.stringify({ task: "analyze", data: customerData }),
    inboxId: agentAInboxId,
});

// Agent B's webhook fires, processes the task
// Agent B replies to Agent A in the same thread
await commune.messages.send({
    to: "agent-a@company.commune.email",
    text: JSON.stringify({ result: analysisResult }),
    inboxId: agentBInboxId,
    threadId: incomingMessage.thread_id,  // same thread
});
```

## Semantic search

```typescript
const results = await commune.search.threads({
    query: "customer asking about cancellation",
    inboxId: "inbox_123",
    limit: 5,
});

// Inject into LLM context
const context = results.map(r => r.subject + ": " + r.snippet).join("\n");
```

## SMS flow

```typescript
// Provision a real phone number
const phone = await commune.phoneNumbers.provision();
console.log(`Phone number: ${phone.number}`);

// Send SMS
await commune.sms.send({
    to: "+14155551234",
    body: "Your order has shipped, expected delivery Friday.",
    phoneNumberId: phone.id,
});

// Inbound SMS arrives via webhook — same handler as email, event.type === "sms.received"
```

## Examples in this folder

| File | Description |
|------|-------------|
| `customer_support_agent.ts` | Express webhook + reply flow |
| `multi_agent_coordination.ts` | Two agents coordinating via email threads |
| `sms_notifications.ts` | Provision number, send SMS, handle replies |
| `webhook_handler.ts` | Reference HMAC verification implementation |

## Tips

- Always use `express.raw()` on webhook routes — never `express.json()`. Parse inside the handler after verification.
- Acknowledge with `res.sendStatus(200)` before processing — Commune waits up to 10 seconds for a response
- Use `setImmediate()` for async processing — never `await` handler logic before responding
- Type the `CommuneWebhookEvent` union — TypeScript will narrow the type in each `case` branch
- Pass `idempotency_key` on any `messages.send()` call that might be retried — prevents duplicate sends

## Related

- [Python examples](../langchain/) — LangChain patterns
- [commune-ai on npm](https://www.npmjs.com/package/commune-ai)
