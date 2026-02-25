# Quick Start Guide for Users

Get started with SwarmAI in 5 minutes. This guide helps you create your first AI agent and have your first conversation.

## Prerequisites

- Access to SwarmAI platform (local or hosted)
- Web browser (Chrome, Firefox, Safari, Edge)
- No coding required!

## Step 1: Create Account

1. Navigate to SwarmAI dashboard (e.g., `http://localhost:3202` or `https://agents.northpeak.app`)
2. Click **Sign Up** or **Get Magic Link**
3. Enter your email address
4. Check your email for the login link
5. Click the link to authenticate

## Step 2: Create Your First Agent

### What is an Agent?
An agent is an AI assistant with specific configuration (personality, knowledge, skills). You can create multiple agents for different purposes.

### Create Agent

1. Click **Agents** in the sidebar
2. Click **+ New Agent** button
3. Fill in agent details:
   - **Name**: "My Assistant" (or any name you prefer)
   - **Description**: "A helpful AI assistant for general questions"
   - **Provider**: OpenRouter (recommended for beginners)
   - **Model**: Select a free model like "DeepSeek R1 0528"
   - **System Prompt**:
     ```
     You are a helpful AI assistant. Answer questions clearly and concisely.
     ```
   - **Temperature**: 0.7 (balanced creativity)
   - **Max Tokens**: 4096

4. Click **Save Changes**

### Agent Created! 🎉
Your agent is now ready to chat.

## Step 3: Start a Conversation

1. Click on your newly created agent in the agents list
2. You'll see the conversation interface
3. Type a message in the text box at the bottom:
   ```
   Hello! Can you tell me what you can help with?
   ```
4. Press **Enter** or click **Send**
5. The agent will respond within seconds

### Try These Example Questions
- "What's the weather like today?" (if weather integration is enabled)
- "Summarize this article: [paste URL]"
- "Help me write a professional email"
- "Explain quantum computing in simple terms"

## Step 4: Explore Features

### Upload Knowledge to Your Agent

Give your agent access to custom documents:

1. Click **Knowledge** in the sidebar
2. Click **+ New Library**
3. Name your library (e.g., "Company Docs")
4. Upload documents (PDF, TXT, DOCX, MD)
5. Wait for processing (you'll see a progress indicator)
6. Go back to your agent settings
7. Link the knowledge library to your agent

Now your agent can answer questions based on your documents!

### Create an Automated Flow

Automate tasks without coding:

1. Click **Flows** in the sidebar
2. Click **+ New Flow**
3. Give it a name: "Daily Summary"
4. Drag nodes from the left panel:
   - Start with a **Schedule Trigger** (runs daily at 9 AM)
   - Add a **Summarize** node (summarizes recent messages)
   - Add a **Send Email** node (sends you the summary)
5. Connect the nodes by dragging between their ports
6. Configure each node by clicking on it
7. Click **Save** and **Activate**

Your flow is now running automatically!

## Step 5: Connect Messaging Platforms

### Connect WhatsApp

1. Go to **Settings** → **Platforms**
2. Click **WhatsApp**
3. Scan the QR code with WhatsApp on your phone
4. Select an agent to handle WhatsApp messages
5. Send a message to your WhatsApp number

Your agent will respond automatically!

### Connect Telegram

1. Go to **Settings** → **Platforms**
2. Click **Telegram**
3. Enter your Telegram Bot Token (get from [@BotFather](https://t.me/botfather))
4. Select an agent to handle Telegram messages
5. Start chatting with your bot

## Common Tasks

### Change Agent Settings

1. Go to **Agents**
2. Click on an agent
3. Click the **⚙️ Settings** icon
4. Modify provider, model, prompt, or temperature
5. Click **Save Changes**

### View Conversation History

1. Go to **Conversations** in the sidebar
2. Browse all conversations across all agents
3. Click on a conversation to view full history
4. Use the search bar to find specific messages

### Manage Subscription

1. Go to **Settings** → **Subscription**
2. View current plan and usage
3. Upgrade or downgrade as needed

## Tips for Success

### Writing Good Prompts

**Bad Prompt**:
```
answer questions
```

**Good Prompt**:
```
You are a professional customer support agent for TechCorp.
Your role is to:
- Answer product questions clearly
- Be empathetic and patient
- Escalate complex issues to human agents
- Always maintain a friendly, professional tone
```

### Choosing the Right Model

| Task | Recommended Model |
|------|------------------|
| Simple Q&A | DeepSeek R1 0528 (free) |
| Creative Writing | Mistral Large (paid) |
| Code Generation | Qwen 2.5 Coder (free) |
| Complex Reasoning | Claude 3.5 Sonnet (paid) |

### Temperature Settings

- **0.1-0.3**: Factual, consistent (customer support, documentation)
- **0.5-0.7**: Balanced (general conversations)
- **0.8-1.0**: Creative, varied (brainstorming, storytelling)

## Troubleshooting

### Agent Not Responding

1. Check that the agent is not in "archived" status
2. Verify your subscription has available API credits
3. Check provider status (some free models may have rate limits)
4. Try a different model

### Messages Not Appearing

1. Refresh the page
2. Check your internet connection
3. Look for error messages in red banners

### Knowledge Not Working

1. Ensure documents finished processing (check library status)
2. Verify the library is linked to your agent
3. Try rephrasing your question to include document keywords

## Next Steps

- [Create Advanced Agents](../02-user-guides/creating-agents.md)
- [Build Complex Flows](../02-user-guides/flowbuilder-basics.md)
- [Manage Knowledge Libraries](../02-user-guides/rag-knowledge.md)
- [Set Up Multi-Agent Swarms](../02-user-guides/swarm-basics.md)

## Get Help

- **Documentation**: Browse this knowledge base
- **Community**: Join our Discord/Slack
- **Support**: Email support@swarmAI.com
- **Issues**: GitHub Issues for bug reports

---

**Estimated Time**: 5-10 minutes
**Difficulty**: Beginner
**Prerequisites**: Web browser, Email access
