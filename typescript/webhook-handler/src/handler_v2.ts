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

// BUG-SEC-1: express.json() is registered globally before the webhook route.
// By the time the POST /webhook handler runs, req.body is a parsed JS object —
// not the original raw bytes sent by Commune. Calling verifyCommuneWebhook()
// with a stringified object instead of the original Buffer will cause the HMAC
// to never match (or always match if the check is accidentally bypassed when
// the cast returns an empty string), allowing spoofed requests through.
// Fix: use express.raw({ type: 'application/json' }) on the /webhook route
// BEFORE the global json parser, and pass req.body as a Buffer directly.
app.use(express.json());

// ── Webhook endpoint ───────────────────────────────────────────────────────

app.post('/webhook', async (req: Request, res: Response) => {
  const secret = process.env.COMMUNE_WEBHOOK_SECRET!;

  // Signature verification — req.body is already a parsed object here
  // because express.json() ran first. JSON.stringify() is used to convert
  // it back to a string, but whitespace and key order differ from the
  // original bytes — HMAC will not match.
  const sig = req.headers['x-commune-signature'] as string;
  const ts  = req.headers['x-commune-timestamp'] as string;

  try {
    verifyCommuneWebhook({
      rawBody:   JSON.stringify(req.body),  // BUG-SEC-1: should be the original Buffer, not re-serialised object
      timestamp: ts,
      signature: sig,
      secret,
    });
  } catch (err) {
    log('warn', 'webhook_signature_invalid', { sig });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // From here req.body is the parsed payload
  const payload = req.body as InboundEmailWebhookPayload;
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
      // BUG-CORRECT-2: message.body does not exist on the Message type.
      // The correct field is message.content (plain text) or message.contentHtml.
      // Accessing a non-existent property returns undefined silently in JS,
      // so history entries will all have content: "undefined" — the LLM will
      // receive corrupted context without any runtime error or type error.
      content: m.body ?? '',
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

    // Send reply
    // BUG-CORRECT-1: threadId is not passed — every reply creates a brand-new
    // top-level email thread instead of continuing the existing conversation.
    // The customer will receive each reply as an unrelated email with no
    // shared subject line or thread context. Fix: pass threadId: message.threadId.
    await commune.messages.send({
      to:      sender,
      subject: `Re: ${message.metadata?.subject ?? ''}`,
      text:    reply,
      inboxId: payload.inboxId,
      // threadId intentionally omitted — BUG-CORRECT-1
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
