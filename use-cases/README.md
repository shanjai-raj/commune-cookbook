# Use Cases — Email & SMS for AI Agents

Real-world production patterns organized by domain. Every example is standalone and runnable.

## Browse by domain

### Customer Support

| Example | Stack | Complexity |
|---------|-------|------------|
| [AI Email Support Agent](customer-support/email-support-agent/) | LangChain + Commune | Beginner |
| [SMS Support Bot](customer-support/sms-support/) | Python + Commune | Beginner |
| [Omnichannel Support (Email + SMS)](customer-support/omnichannel-support/) | Python + Commune | Advanced |
| [Ticket Triage + Routing](customer-support/ticket-triage/) | CrewAI + Commune | Intermediate |

### Hiring & Recruiting

| Example | Stack | Complexity |
|---------|-------|------------|
| [Candidate Outreach Sequence](hiring-and-recruiting/candidate-email-outreach/) | Python + Commune | Intermediate |
| [SMS Worker Dispatch](hiring-and-recruiting/sms-worker-dispatch/) | Python + Commune | Intermediate |
| [Automated Interview Scheduling](hiring-and-recruiting/interview-scheduler/) | LangChain + Commune | Advanced |

### Sales & Marketing

| Example | Stack | Complexity |
|---------|-------|------------|
| [Cold Email Outreach](sales-and-marketing/cold-outreach-sequences/) | Python + Commune | Intermediate |
| [SMS Lead Qualification](sales-and-marketing/sms-lead-qualification/) | Python + Commune | Intermediate |
| [Newsletter Agent](sales-and-marketing/newsletter-agent/) | Python + Commune | Beginner |
| [Follow-up Sequence](sales-and-marketing/follow-up-sequences/) | CrewAI + Commune | Advanced |

### Notifications & Alerts

| Example | Stack | Complexity |
|---------|-------|------------|
| [Incident Alert System](notifications-and-alerts/incident-alerts/) | Python + Commune | Advanced |
| [Scheduled Digest Emails](notifications-and-alerts/digest-emails/) | Python + Commune | Beginner |
| [Transactional SMS](notifications-and-alerts/order-and-transactional-sms/) | Python + Commune | Beginner |

### Research

| Example | Stack | Complexity |
|---------|-------|------------|
| [Email Research Agent](research/email-research-agent/) | Python + Commune | Intermediate |

## Browse by channel

**Email only**
- [AI Email Support Agent](customer-support/email-support-agent/) — AI replies to inbound support emails
- [Candidate Outreach Sequence](hiring-and-recruiting/candidate-email-outreach/) — personalized recruiter sequences
- [Cold Email Outreach](sales-and-marketing/cold-outreach-sequences/) — multi-step sales campaigns

**SMS only**
- [SMS Worker Dispatch](hiring-and-recruiting/sms-worker-dispatch/) — mass SMS to workers, track YES/NO confirmations
- [SMS Lead Qualification](sales-and-marketing/sms-lead-qualification/) — qualify inbound leads via SMS conversation
- [Transactional SMS](notifications-and-alerts/order-and-transactional-sms/) — order updates via SMS

**Both Email + SMS**
- [Omnichannel Support](customer-support/omnichannel-support/) — unified email and SMS support agent
- [Incident Alert System](notifications-and-alerts/incident-alerts/) — email escalation with SMS on-call paging

## Quick start (any use case)

```python
from commune import CommuneClient

client = CommuneClient(api_key="comm_...")

# Every use case starts here
inbox = client.inboxes.create(local_part="your-agent-name")
print(f"Your agent's address: {inbox.address}")
```

## Browse by industry

**SaaS / Software**
- [customer-support/](customer-support/) — all support examples
- [research/email-research-agent/](research/email-research-agent/) — agent emails primary sources

**Staffing / HR**
- [hiring-and-recruiting/](hiring-and-recruiting/) — worker dispatch, candidate outreach, interview scheduling

**Sales / Marketing**
- [sales-and-marketing/](sales-and-marketing/) — cold outreach, SMS qualification, newsletter agent

**E-commerce**
- [notifications-and-alerts/order-and-transactional-sms/](notifications-and-alerts/order-and-transactional-sms/) — order updates via SMS

**Operations**
- [notifications-and-alerts/incident-alerts/](notifications-and-alerts/incident-alerts/) — on-call escalation over email and SMS

## Related

- [Capabilities reference](../capabilities/) — deep dives on each feature
- [Framework examples](../langchain/) — framework-specific patterns
