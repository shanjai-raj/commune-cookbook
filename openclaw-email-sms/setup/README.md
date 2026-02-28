# Setup Guide — Commune + OpenClaw Integration

Step-by-step instructions for connecting your OpenClaw agent to Commune email and SMS.

---

## Step 1: Get Your Commune API Key

1. Sign up at [commune.email](https://commune.email)
2. Go to your dashboard → API Keys
3. Create a new key — it will start with `comm_`
4. Copy it somewhere safe. You won't see it again after this screen.

---

## Step 2: Install the Skills

```bash
# Clone the email-for-agents repo
git clone https://github.com/commune-email/email-for-agents
cd email-for-agents/openclaw-email-sms

# Copy skills into your OpenClaw workspace
cp -r skills/commune-email ~/.openclaw/workspace/skills/
cp -r skills/commune-sms ~/.openclaw/workspace/skills/

# Make the helper scripts executable
chmod +x ~/.openclaw/workspace/skills/commune-email/commune.js
chmod +x ~/.openclaw/workspace/skills/commune-sms/commune-sms.js
```

Verify the skills appeared:

```bash
openclaw skill list | grep commune
# commune-email
# commune-sms
```

---

## Step 3: Set Environment Variables

Add these to your shell profile (`~/.zshrc` or `~/.bashrc`) or your server's environment config. Fill in the values as you complete subsequent steps.

```bash
# Required
export COMMUNE_API_KEY=comm_your_key_here

# Set after Step 4 (inbox creation)
export COMMUNE_INBOX_ID=inbox_xxx
export COMMUNE_INBOX_ADDRESS=assistant@yourdomain.commune.email

# Set after Step 5 (phone number, optional)
export COMMUNE_PHONE_ID=pn_xxx
export COMMUNE_PHONE_NUMBER=+14155551234
```

After editing your shell profile, reload it:

```bash
source ~/.zshrc   # or source ~/.bashrc
```

---

## Step 4: Create Your Inbox

Either ask your agent directly:

```
You: Create a Commune inbox called "assistant"
Agent: Created inbox: assistant@yourdomain.commune.email | ID: inbox_xxx
```

Or via the CLI helper:

```bash
node ~/.openclaw/workspace/skills/commune-email/commune.js create-inbox assistant
```

Output:
```
Inbox created successfully.
Address: assistant@yourdomain.commune.email
Inbox ID: inbox_xxx

Add these to your environment:
  export COMMUNE_INBOX_ID=inbox_xxx
  export COMMUNE_INBOX_ADDRESS=assistant@yourdomain.commune.email
```

Copy the values and add them to your environment (Step 3).

**Note:** The inbox address is permanent. Choose a local part (`assistant`, `support`, `me`) that makes sense for your use case.

---

## Step 5: Get a Phone Number (Optional)

If you want SMS capability:

1. Go to [commune.email/dashboard](https://commune.email/dashboard) → Phone Numbers → Provision
2. Choose a number (US, UK, or other regions available)
3. List your numbers to get the ID:

```bash
node ~/.openclaw/workspace/skills/commune-sms/commune-sms.js list-numbers
# +14155551234 — ID: pn_xxx
```

Add to your environment:

```bash
export COMMUNE_PHONE_ID=pn_xxx
export COMMUNE_PHONE_NUMBER=+14155551234
```

---

## Step 6: Verify the Integration

Test that everything is connected:

```bash
# Test email — create a scratch inbox
node ~/.openclaw/workspace/skills/commune-email/commune.js create-inbox test

# Test list threads (should return empty or your threads)
node ~/.openclaw/workspace/skills/commune-email/commune.js list-threads $COMMUNE_INBOX_ID

# Test SMS list (if you have a phone number)
node ~/.openclaw/workspace/skills/commune-sms/commune-sms.js list-numbers
```

Send a test email to your new inbox from any email client, wait 30 seconds, then:

```bash
node ~/.openclaw/workspace/skills/commune-email/commune.js list-threads
# [WAITING REPLY] thread_xxx | 1 msg | Test email
```

If you see your test email listed, the integration is working.

---

## Step 7: Tell Your Agent

Add your inbox details to `~/.openclaw/workspace/USER.md` so the agent knows about them:

```markdown
## Communication

### Email
My Commune inbox: assistant@yourdomain.commune.email
Inbox ID: inbox_xxx

When checking email:
- Prioritize threads with last_direction: inbound (waiting for reply)
- Skip newsletter/automated notifications unless I ask
- Reply in my voice — casual but professional

### SMS
My Commune phone number: +14155551234
Phone number ID: pn_xxx

Common contacts:
- [Name]: +1XXXXXXXXXX
```

For a company agent, update the agent's `SOUL.md` with its inbox and responsibilities. See [../use-cases/company-assistant/README.md](../use-cases/company-assistant/README.md) for a full template.

---

## Step 8: Test With Your Agent

Restart OpenClaw to pick up the new skills and environment variables, then test:

```
You: Check my Commune email inbox
Agent: [lists your threads]

You: Send a test email to yourself@gmail.com with subject "Hello from my agent"
Agent: [sends via Commune]

You: Text +14155551234 "this is a test"  (use your own number to self-test)
Agent: [sends SMS]
```

---

## Troubleshooting

### "Agent doesn't seem to use Commune"

1. Verify the skill files are in the right place:
   ```bash
   ls ~/.openclaw/workspace/skills/commune-email/
   # SKILL.md  commune.js
   ```
2. Check that `COMMUNE_API_KEY` is actually set in the environment OpenClaw runs in:
   ```bash
   echo $COMMUNE_API_KEY
   ```
3. Restart OpenClaw after setting environment variables — it reads env on startup.
4. Explicitly mention Commune in your request: "Use the Commune email skill to check my inbox."

---

### "Authentication error (401)"

Your API key is invalid or expired.

1. Go to [commune.email/dashboard](https://commune.email/dashboard) → API Keys
2. Verify the key matches exactly what's in your environment (no trailing spaces)
3. If needed, rotate the key and update `COMMUNE_API_KEY`

---

### "No threads showing"

1. Check that `COMMUNE_INBOX_ID` is set and correct:
   ```bash
   echo $COMMUNE_INBOX_ID
   ```
2. Send a test email to your inbox address and wait 30 seconds
3. Confirm the inbox address is correct:
   ```bash
   node ~/.openclaw/workspace/skills/commune-email/commune.js create-inbox check
   # If you get a "already exists" error, the address is correct
   ```
4. Try listing with the inbox ID explicitly:
   ```bash
   node ~/.openclaw/workspace/skills/commune-email/commune.js list-threads inbox_xxx
   ```

---

### "SMS send failed"

1. Check number format — must be E.164: `+14155551234`
   - The CLI helper auto-normalizes US 10-digit numbers
   - For non-US numbers, include the country code
2. Verify `COMMUNE_PHONE_ID` is set and matches a provisioned number:
   ```bash
   node ~/.openclaw/workspace/skills/commune-sms/commune-sms.js list-numbers
   ```
3. Check that your Commune account has SMS credits or an active plan

---

### "Replies are starting new threads instead of replying"

The `thread_id` is not being passed in the send request. Make sure the agent:
1. Reads the thread first to get the `thread_id`
2. Passes `thread_id` in the body of `POST /v1/messages/send`

In SKILL.md this is documented as critical — if the agent is skipping it, add an explicit note to your `SOUL.md` or `USER.md`: "Always include thread_id when replying to email."

---

### "Search isn't finding emails I know exist"

1. Vector indexing takes a short time after new emails arrive — wait 1-2 minutes after a new email arrives before searching
2. Try rephrasing — semantic search responds to meaning, not just keywords
3. For exact matches, use `list-threads` and scan subject lines instead

---

## Environment Variable Reference

| Variable | Required | Description | Where to find it |
|----------|----------|-------------|-----------------|
| `COMMUNE_API_KEY` | Yes | Your Commune API key | commune.email/dashboard → API Keys |
| `COMMUNE_INBOX_ID` | Recommended | Default inbox ID | Response from `create-inbox` |
| `COMMUNE_INBOX_ADDRESS` | Recommended | Full inbox address | Response from `create-inbox` |
| `COMMUNE_PHONE_ID` | Optional | Default phone number ID | Response from `list-numbers` |
| `COMMUNE_PHONE_NUMBER` | Optional | Full phone number in E.164 | Response from `list-numbers` |

---

## What's Next

- [Personal assistant use case](../use-cases/personal-assistant/README.md) — prompts and setup for personal email management
- [Company agent use case](../use-cases/company-assistant/README.md) — deployment patterns for customer-facing agents
- [commune-email SKILL.md](../skills/commune-email/SKILL.md) — full email API reference for your agent
- [commune-sms SKILL.md](../skills/commune-sms/SKILL.md) — full SMS API reference for your agent
