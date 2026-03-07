# Notebooks

Interactive Jupyter notebooks — numbered as a progressive curriculum. Run any of them in Colab with no local setup, or work through them in order.

## Run in the cloud (no setup)

Click any badge below to open in Google Colab. The first cell installs all dependencies.

## Run locally

```bash
pip install jupyter commune-mail langchain-openai crewai openai langgraph
jupyter lab
```

Set `COMMUNE_API_KEY` and `OPENAI_API_KEY` as environment variables or Colab secrets before running.

---

## Curriculum

| # | Notebook | What you learn | Framework |
|---|---------|---------------|-----------|
| 01 | [`01_quickstart.ipynb`](01_quickstart.ipynb) | Create inbox, send email, read threads | Python |
| 02 | [`02_langchain_customer_support.ipynb`](02_langchain_customer_support.ipynb) | Full support agent with triage, routing, and reply | LangChain |
| 03 | [`03_structured_extraction.ipynb`](03_structured_extraction.ipynb) | Auto-parse email fields to typed JSON (no extra LLM call) | Any |
| 04 | [`04_crewai_multi_agent.ipynb`](04_crewai_multi_agent.ipynb) | Crew of agents coordinating over email threads | CrewAI |
| 05 | [`05_openai_agents_email.ipynb`](05_openai_agents_email.ipynb) | Email as tools in the OpenAI Agents SDK | OpenAI Agents |
| 06 | [`06_langgraph_email_agent.ipynb`](06_langgraph_email_agent.ipynb) | Stateful email agent with `StateGraph`, `MemorySaver`, thread isolation | LangGraph |
| 07 | [`07_async_streaming.ipynb`](07_async_streaming.ipynb) | `AsyncCommuneClient`, `asyncio.gather()`, semaphore, fire-and-forget | Async Python |
| 08 | [`08_sms_email_combined.ipynb`](08_sms_email_combined.ipynb) | Urgency classifier routing to email + SMS, suppression checks | Python |
| 09 | [`09_langchain_production.ipynb`](09_langchain_production.ipynb) | Production LangChain patterns: idempotency, retries, observability | LangChain |
| 10 | [`10_crewai_production.ipynb`](10_crewai_production.ipynb) | Production CrewAI patterns: multi-tenant isolation, prompt injection | CrewAI |
| 11 | [`11_openai_agents_production.ipynb`](11_openai_agents_production.ipynb) | Production OpenAI Agents: async tools, webhook patterns | OpenAI Agents |
| 12 | [`12_claude_tool_use.ipynb`](12_claude_tool_use.ipynb) | Claude `tool_use` API with email tools | Claude |
| 13 | [`13_autogen_email_agent.ipynb`](13_autogen_email_agent.ipynb) | AutoGen multi-agent with email | AutoGen |

---

## Reading order

**New to Commune?** → Start with `01_quickstart.ipynb`, then pick your framework (02–05).

**Using LangGraph?** → Jump to `06_langgraph_email_agent.ipynb`.

**Building async webhooks?** → `07_async_streaming.ipynb`.

**Need SMS + email together?** → `08_sms_email_combined.ipynb`.

**Going to production?** → `09`, `10`, or `11` for your framework's production patterns.
