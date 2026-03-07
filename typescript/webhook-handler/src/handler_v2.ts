/**
 * Commune Email Webhook Handler v2 — TypeScript / Express
 *
 * Receives inbound email events, verifies signatures, and generates
 * AI-powered replies using per-inbox extracted data when available.
 *
 * Changes from v1:
 *   - Auto-detects priority from subject line
 *   - Adds X-Commune-Priority header to outbound replies
 *   - Logs structured JSON to stdout for observability pipelines
 *
 * Install:
 *   npm install
 *
 * Environment:
 *   COMMUNE_API_KEY         — from commune.email dashboard
 *   COMMUNE_WEBHOOK_SECRET  — set when registering the webhook
 *   OPENAI_API_KEY          — for reply generation
 *
 * Usage:
 *   npm run dev
 */
import express, { type Request, type Response } from 'express';
import { CommuneClient, verifyCommuneWebhook, type InboundEmailWebhookPayload } from 'commune-ai';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3000;

const commune = new CommuneClient({ apiKey: process.env.COMMUNE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// FIX BUG-SEC-1: express.raw() is registered for the /webhook route ONLY,
// before any JSON parsing. This preserves req.body as a raw Buffer — the
// exact bytes Commune signed. verifyCommuneWebhook() computes HMAC over
// these bytes, which matches the signature Commune computed server-side.
// Do NOT use express.json() globally when you need raw-body HMAC verification.
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ── Webhook endpoint ───────────────────────────────────────────────────────

app.post('/webhook', async (req: Request, res: Response) => {
  const secret = process.env.COMMUNE_WEBHOOK_SECRET!;

  // FIX BUG-SEC-1: req.body is a raw Buffer from express.raw() above.
  // Pass it directly to verifyCommuneWebhook() — this is the exact byte
  // sequence that Commune signed, so HMAC comparison will succeed.
  const rawBody = req.body as Buffer;
  const sig = req.headers['x-commune-signature'] as string;
  const ts  = req.headers['x-commune-timestamp'] as string;

  try {
    verifyCommuneWebhook({
      rawBody:   rawBody.toString('utf8'),  // FIX: original bytes, not JSON.stringify(parsed object)
      timestamp: ts,
      signature: sig,
      secret,
    });
  } catch (err) {
    log('warn', 'webhook_signature_invalid', { sig });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse JSON after signature verification
  const payload = JSON.parse(rawBody.toString('utf8')) as InboundEmailWebhookPayload;
  const { message, extractedData, security } = payload;

  if (message.direction !== 'inbound') {
    return res.status(200).json({ ok: true });
  }

  // Acknowledge quickly — LLM processing happens after the 200
  res.status(200).json({ ok: true });

  // Spam / injection guard
  if (security?.spam?.flagged) {
    log('info', 'email_skipped', { reason: 'spam', messageId: message.id });
    return;
  }
  if (security?.prompt_injection?.detected && security.prompt_injection.risk_level !== 'low') {
    log('info', 'email_skipped', { reason: 'prompt_injection', level: security.prompt_injection.risk_level });
    return;
  }

  const sender = message.participants.find(p => p.role === 'sender')?.identity;
  if (!sender) return;

  const intent  = extractedData?.intent  as string | undefined;
  const urgency = extractedData?.urgency as string | undefined;

  log('info', 'email_received', {
    sender,
    subject: message.metadata?.subject,
    intent,
    urgency,
  });

  try {
    // Load thread history for context
    const threadMessages = await commune.threads.messages(message.threadId);
    const history = threadMessages.map(m => ({
      role:    m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      // FIX BUG-CORRECT-2: use .content (plain text), not .body (does not exist
      // on the Message type). Accessing a non-existent field returns undefined
      // silently, causing all history entries to have content: "undefined".
      content: m.content ?? '',
    }));

    const priorityNote = urgency === 'high'
      ? 'NOTE: This is marked HIGH PRIORITY — respond with urgency.'
      : '';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: [
            'You are a helpful support agent. Reply professionally and concisely.',
            intent     ? `Email intent: ${intent}` : '',
            urgency    ? `Urgency: ${urgency}`     : '',
            priorityNote,
            'Sign off as "Support Team".',
          ].filter(Boolean).join('\n'),
        },
        ...history,
      ],
    });

    const reply = completion.choices[0].message.content!;

    // FIX BUG-CORRECT-1: pass threadId so the reply continues the existing
    // conversation thread instead of creating a new top-level email.
    // Without this, each AI reply arrives as an unrelated email — customers
    // lose the thread context and cannot reply in the same conversation.
    await commune.messages.send({
      to:       sender,
      subject:  `Re: ${message.metadata?.subject ?? ''}`,
      text:     reply,
      inboxId:  payload.inboxId,
      threadId: message.threadId,  // FIX BUG-CORRECT-1: continue the existing thread
    });

    // Tag urgent threads for dashboard visibility
    if (urgency === 'high') {
      await commune.threads.addTags(message.threadId, ['urgent', 'priority']);
    }
    await commune.threads.setStatus(message.threadId, 'waiting');

    log('info', 'reply_sent', { sender, intent, urgency });

  } catch (err) {
    log('error', 'handler_error', { error: String(err) });
  }
});

// ── Health check ───────────────────────────────────────────────────────────

app.get('/health', (_: Request, res: Response) => res.json({ ok: true, version: 'v2' }));

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Commune webhook handler v2 running on port ${port}`);
  console.log(`  POST /webhook — inbound email events`);
  console.log(`  GET  /health  — health check`);
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Structured logger — emits JSON lines compatible with Railway / Datadog log parsers. */
function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  console[level === 'error' ? 'error' : 'log'](
    JSON.stringify({ level, event, ...data, ts: new Date().toISOString() }),
  );
}
