#!/usr/bin/env node
/**
 * Commune Email CLI helper for OpenClaw
 * Usage: node commune.js <command> [args]
 *
 * Commands:
 *   list-threads [inbox_id]            — list threads, flags ones waiting for reply
 *   read-thread <thread_id>            — print full conversation
 *   send <to> <subject> <body> [inbox_id]
 *   reply <thread_id> <to> <body> [inbox_id]
 *   search <query> [inbox_id]
 *   create-inbox <local_part>
 *
 * Environment variables:
 *   COMMUNE_API_KEY     required
 *   COMMUNE_INBOX_ID    optional default inbox
 */

const BASE = 'https://api.commune.email';
const KEY = process.env.COMMUNE_API_KEY;
const DEFAULT_INBOX = process.env.COMMUNE_INBOX_ID;

if (!KEY) {
  console.error('Error: COMMUNE_API_KEY environment variable is not set.');
  console.error('Get your key at https://commune.email/dashboard');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    console.error(`Network error: ${err.message}`);
    process.exit(1);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} from ${method} ${path}`);
    console.error(text);
    process.exit(1);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case 'list-threads': {
    const inboxId = args[0] || DEFAULT_INBOX;
    if (!inboxId) {
      console.error('Error: inbox_id required (or set COMMUNE_INBOX_ID)');
      process.exit(1);
    }
    const data = await api('GET', `/v1/threads?inbox_id=${inboxId}&limit=20`);
    const threads = data.data || data || [];
    if (threads.length === 0) {
      console.log('No threads found.');
      break;
    }
    threads.forEach(t => {
      const status = t.last_direction === 'inbound' ? '[WAITING REPLY]' : '[replied]     ';
      const count = `${t.message_count || 1} msg${(t.message_count || 1) !== 1 ? 's' : ''}`;
      console.log(`${status} ${t.thread_id} | ${count} | ${t.subject || '(no subject)'}`);
    });
    break;
  }

  case 'read-thread': {
    const threadId = args[0];
    if (!threadId) {
      console.error('Error: thread_id required');
      process.exit(1);
    }
    const msgs = await api('GET', `/v1/threads/${threadId}/messages`);
    const messages = Array.isArray(msgs) ? msgs : msgs.data || [];
    if (messages.length === 0) {
      console.log('No messages in this thread.');
      break;
    }
    messages.forEach((m, i) => {
      const sender =
        (m.participants || []).find(p => p.role === 'sender')?.identity ||
        m.from ||
        'unknown';
      const dir = (m.direction || 'unknown').toUpperCase();
      const subject = m.metadata?.subject || m.subject || '';
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`[${i + 1}] ${dir} — from: ${sender}${subject ? ` — subject: ${subject}` : ''}`);
      console.log(`${'─'.repeat(60)}`);
      console.log(m.content || m.text || m.body || '(no content)');
    });
    console.log(`\n${'─'.repeat(60)}`);
    break;
  }

  case 'send': {
    const [to, subject, body, inboxId] = args;
    if (!to || !subject || !body) {
      console.error('Usage: commune.js send <to> <subject> <body> [inbox_id]');
      process.exit(1);
    }
    const effectiveInbox = inboxId || DEFAULT_INBOX;
    if (!effectiveInbox) {
      console.error('Error: inbox_id required (or set COMMUNE_INBOX_ID)');
      process.exit(1);
    }
    const r = await api('POST', '/v1/messages/send', {
      to,
      subject,
      text: body,
      inboxId: effectiveInbox,
    });
    console.log('Sent successfully.');
    console.log('Message ID:', r.message_id || r.id || JSON.stringify(r));
    break;
  }

  case 'reply': {
    const [threadId, to, body, inboxId] = args;
    if (!threadId || !to || !body) {
      console.error('Usage: commune.js reply <thread_id> <to> <body> [inbox_id]');
      process.exit(1);
    }
    const effectiveInbox = inboxId || DEFAULT_INBOX;
    if (!effectiveInbox) {
      console.error('Error: inbox_id required (or set COMMUNE_INBOX_ID)');
      process.exit(1);
    }

    // Fetch the thread to get the original subject
    const msgs = await api('GET', `/v1/threads/${threadId}/messages`);
    const messages = Array.isArray(msgs) ? msgs : msgs.data || [];
    const firstMsg = messages[0];
    const originalSubject =
      firstMsg?.metadata?.subject || firstMsg?.subject || '';
    const subject = originalSubject.startsWith('Re:')
      ? originalSubject
      : `Re: ${originalSubject}`;

    const r = await api('POST', '/v1/messages/send', {
      to,
      subject,
      text: body,
      inboxId: effectiveInbox,
      thread_id: threadId,
    });
    console.log('Reply sent successfully.');
    console.log('Message ID:', r.message_id || r.id || JSON.stringify(r));
    break;
  }

  case 'search': {
    const [query, inboxId] = args;
    if (!query) {
      console.error('Usage: commune.js search <query> [inbox_id]');
      process.exit(1);
    }
    const effectiveInbox = inboxId || DEFAULT_INBOX;
    const path = effectiveInbox
      ? `/v1/search/threads?q=${encodeURIComponent(query)}&inbox_id=${effectiveInbox}`
      : `/v1/search/threads?q=${encodeURIComponent(query)}`;
    const r = await api('GET', path);
    const results = Array.isArray(r) ? r : r.data || [];
    if (results.length === 0) {
      console.log('No results found.');
      break;
    }
    results.forEach(t => {
      const score = t.score != null ? `[${t.score.toFixed(2)}] ` : '';
      console.log(`${score}${t.thread_id} | ${t.subject || '(no subject)'}`);
    });
    break;
  }

  case 'create-inbox': {
    const localPart = args[0] || 'assistant';
    const r = await api('POST', '/v1/inboxes', { localPart });
    console.log('Inbox created successfully.');
    console.log('Address:', r.address);
    console.log('Inbox ID:', r.id);
    console.log('');
    console.log('Add these to your environment:');
    console.log(`  export COMMUNE_INBOX_ID=${r.id}`);
    console.log(`  export COMMUNE_INBOX_ADDRESS=${r.address}`);
    break;
  }

  default: {
    console.log('Commune Email CLI — OpenClaw helper');
    console.log('');
    console.log('Usage: node commune.js <command> [args]');
    console.log('');
    console.log('Commands:');
    console.log('  list-threads [inbox_id]              List threads (flags ones awaiting reply)');
    console.log('  read-thread <thread_id>              Print full conversation');
    console.log('  send <to> <subject> <body> [inbox]   Send a new email');
    console.log('  reply <thread_id> <to> <body> [inbox] Reply in an existing thread');
    console.log('  search <query> [inbox_id]            Semantic search across threads');
    console.log('  create-inbox <local_part>            Create a new inbox');
    console.log('');
    console.log('Environment variables:');
    console.log('  COMMUNE_API_KEY     Your Commune API key (required)');
    console.log('  COMMUNE_INBOX_ID    Default inbox ID (optional)');
    if (cmd && cmd !== 'help') {
      console.error(`\nUnknown command: ${cmd}`);
      process.exit(1);
    }
  }
}
