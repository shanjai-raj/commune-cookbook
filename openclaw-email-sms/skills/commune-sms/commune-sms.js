#!/usr/bin/env node
/**
 * Commune SMS CLI helper for OpenClaw
 * Usage: node commune-sms.js <command> [args]
 *
 * Commands:
 *   list-numbers                       — list your Commune phone numbers
 *   send <to> <body> [phone_id]        — send an SMS
 *   list-convos [phone_id]             — list all SMS conversations
 *   read-thread <contact_number> [phone_id] — read conversation with a number
 *
 * Environment variables:
 *   COMMUNE_API_KEY     required
 *   COMMUNE_PHONE_ID    optional default phone number ID
 */

const BASE = 'https://api.commune.email';
const KEY = process.env.COMMUNE_API_KEY;
const DEFAULT_PHONE_ID = process.env.COMMUNE_PHONE_ID;

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

/**
 * Normalize a phone number to E.164 format.
 * Handles common US formats — adds +1 prefix if missing.
 */
function normalizeNumber(raw) {
  // Strip all non-digit characters except leading +
  const cleaned = raw.replace(/[^\d+]/g, '');
  // Already in E.164
  if (cleaned.startsWith('+')) return cleaned;
  // 10-digit US number
  if (cleaned.length === 10) return `+1${cleaned}`;
  // 11-digit with leading 1
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  // Return as-is for international numbers the user has already formatted
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case 'list-numbers': {
    const numbers = await api('GET', '/v1/phone-numbers');
    const list = Array.isArray(numbers) ? numbers : numbers.data || [];
    if (list.length === 0) {
      console.log('No phone numbers found. Provision one at https://commune.email/dashboard');
      break;
    }
    list.forEach(n => {
      const label = n.label ? ` (${n.label})` : '';
      const caps = n.capabilities ? ` [${n.capabilities.join(', ')}]` : '';
      console.log(`${n.number}${label}${caps} — ID: ${n.id}`);
    });
    console.log('');
    console.log('To set a default, add to your environment:');
    console.log(`  export COMMUNE_PHONE_ID=${list[0].id}`);
    break;
  }

  case 'send': {
    const [to, body, phoneId] = args;
    if (!to || !body) {
      console.error('Usage: commune-sms.js send <to> <body> [phone_id]');
      console.error('Example: commune-sms.js send +14155551234 "Meeting moved to 3pm"');
      process.exit(1);
    }
    const effectivePhoneId = phoneId || DEFAULT_PHONE_ID;
    if (!effectivePhoneId) {
      console.error('Error: phone_id required (or set COMMUNE_PHONE_ID)');
      process.exit(1);
    }
    const normalizedTo = normalizeNumber(to);
    const r = await api('POST', '/v1/sms/send', {
      to: normalizedTo,
      body,
      phone_number_id: effectivePhoneId,
    });
    console.log('SMS sent successfully.');
    console.log('To:', normalizedTo);
    console.log('Message ID:', r.message_id || r.id || JSON.stringify(r));
    break;
  }

  case 'list-convos': {
    const [phoneId] = args;
    const effectivePhoneId = phoneId || DEFAULT_PHONE_ID;
    if (!effectivePhoneId) {
      console.error('Error: phone_id required (or set COMMUNE_PHONE_ID)');
      process.exit(1);
    }
    const convos = await api('GET', `/v1/sms/conversations?phone_number_id=${effectivePhoneId}`);
    const list = Array.isArray(convos) ? convos : convos.data || [];
    if (list.length === 0) {
      console.log('No SMS conversations found.');
      break;
    }
    list.forEach(c => {
      const waitingFlag = c.direction === 'inbound' ? '[WAITING REPLY]' : '[replied]     ';
      const lastMsg = c.last_message
        ? c.last_message.length > 60
          ? c.last_message.slice(0, 57) + '...'
          : c.last_message
        : '(no message)';
      const msgCount = c.message_count ? ` | ${c.message_count} msgs` : '';
      console.log(`${waitingFlag} ${c.contact_number}${msgCount} | "${lastMsg}"`);
    });
    break;
  }

  case 'read-thread': {
    const [contactNumber, phoneId] = args;
    if (!contactNumber) {
      console.error('Usage: commune-sms.js read-thread <contact_number> [phone_id]');
      console.error('Example: commune-sms.js read-thread +14155551234');
      process.exit(1);
    }
    const normalized = normalizeNumber(contactNumber);
    const encoded = encodeURIComponent(normalized);
    const msgs = await api('GET', `/v1/sms/conversations/${encoded}`);
    const messages = Array.isArray(msgs) ? msgs : msgs.data || [];
    if (messages.length === 0) {
      console.log(`No messages found with ${normalized}`);
      break;
    }
    console.log(`\nSMS conversation with ${normalized}`);
    console.log('='.repeat(50));
    messages.forEach(m => {
      const dir = m.direction === 'outbound' ? 'You' : normalized;
      const time = m.created_at ? new Date(m.created_at).toLocaleString() : '';
      console.log(`\n[${dir}]${time ? ` at ${time}` : ''}`);
      console.log(m.body || m.content || m.text || '(no content)');
    });
    console.log('\n' + '='.repeat(50));
    break;
  }

  default: {
    console.log('Commune SMS CLI — OpenClaw helper');
    console.log('');
    console.log('Usage: node commune-sms.js <command> [args]');
    console.log('');
    console.log('Commands:');
    console.log('  list-numbers                              List your Commune phone numbers');
    console.log('  send <to> <body> [phone_id]               Send an SMS');
    console.log('  list-convos [phone_id]                    List all SMS conversations');
    console.log('  read-thread <contact_number> [phone_id]   Read conversation with a number');
    console.log('');
    console.log('Environment variables:');
    console.log('  COMMUNE_API_KEY     Your Commune API key (required)');
    console.log('  COMMUNE_PHONE_ID    Default phone number ID (optional)');
    console.log('');
    console.log('Number format: E.164 preferred (+14155551234)');
    console.log('  US 10-digit numbers are auto-prefixed with +1');
    if (cmd && cmd !== 'help') {
      console.error(`\nUnknown command: ${cmd}`);
      process.exit(1);
    }
  }
}
