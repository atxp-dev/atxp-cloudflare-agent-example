# 🤖 Chat Agent Starter Kit

![npm i agents command](./npm-agents-banner.svg)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

A starter template for building AI-powered chat agents using Cloudflare's Agent platform, powered by [`agents`](https://www.npmjs.com/package/agents). This project provides a foundation for creating interactive chat experiences with AI, complete with a modern UI and tool integration capabilities.

## Features

- 💬 Interactive chat interface with AI
- 🛠️ Built-in tool system with human-in-the-loop confirmation
- 📅 Advanced task scheduling (one-time, delayed, and recurring via cron)
- 🎨 **AI Image Generation** - Create images from text prompts with automatic completion notifications
- 🌓 Dark/Light theme support
- ⚡️ Real-time streaming responses
- 🔄 State management and chat history
- 🖼️ Modern, responsive UI with inline image display

## Prerequisites

- Cloudflare account
- OpenAI API key
- ATXP account (optional, for AI image generation features) - Get one at [accounts.atxp.ai](https://accounts.atxp.ai)

## Quick Start

1. Create a new project:

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up your environment:

Create a `.dev.vars` file:

```env
OPENAI_API_KEY=your_openai_api_key
ATXP_CONNECTION_STRING=https://accounts.atxp.ai?connection_token=your_connection_token
```

**Note:** The ATXP_CONNECTION_STRING is optional and only needed if you want to use the AI image generation features. You can also provide connection strings dynamically through the chat interface.

4. Run locally:

```bash
npm start
```

5. Deploy:

```bash
npm run deploy
```

## Project Structure

```
├── src/
│   ├── app.tsx              # Chat UI implementation
│   ├── server.ts            # Chat agent logic with image polling
│   ├── tools.ts             # Basic tool definitions
│   ├── tools/
│   │   └── imageGeneration.ts  # ATXP image generation tools
│   ├── utils/
│   │   └── atxp.ts          # ATXP connection utilities
│   ├── utils.ts             # Helper functions
│   └── styles.css           # UI styling
```

## Customization Guide

### Adding New Tools

Add new tools in `tools.ts` using the tool builder:

```ts
// Example of a tool that requires confirmation
const searchDatabase = tool({
  description: "Search the database for user records",
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional()
  })
  // No execute function = requires confirmation
});

// Example of an auto-executing tool
const getCurrentTime = tool({
  description: "Get current server time",
  parameters: z.object({}),
  execute: async () => new Date().toISOString()
});

// Scheduling tool implementation
const scheduleTask = tool({
  description:
    "schedule a task to be executed at a later time. 'when' can be a date, a delay in seconds, or a cron pattern.",
  parameters: z.object({
    type: z.enum(["scheduled", "delayed", "cron"]),
    when: z.union([z.number(), z.string()]),
    payload: z.string()
  }),
  execute: async ({ type, when, payload }) => {
    // ... see the implementation in tools.ts
  }
});
```

To handle tool confirmations, add execution functions to the `executions` object:

```typescript
export const executions = {
  searchDatabase: async ({
    query,
    limit
  }: {
    query: string;
    limit?: number;
  }) => {
    // Implementation for when the tool is confirmed
    const results = await db.search(query, limit);
    return results;
  }
  // Add more execution handlers for other tools that require confirmation
};
```

Tools can be configured in two ways:

1. With an `execute` function for automatic execution
2. Without an `execute` function, requiring confirmation and using the `executions` object to handle the confirmed action. NOTE: The keys in `executions` should match `toolsRequiringConfirmation` in `app.tsx`.

### AI Image Generation with ATXP

This project includes advanced AI image generation capabilities powered by ATXP (AI Transaction Protocol). The image generation system provides:

- **Automatic background processing** - Images generate asynchronously while you continue chatting
- **Real-time status updates** - Get notified when generation starts and completes
- **Inline image display** - Generated images appear directly in the chat
- **Payment notifications** - Receive chat messages when payments are processed for image generation
- **Task management** - View all your image generation tasks and their status

#### Setting up Image Generation

1. **Get an ATXP account** at [accounts.atxp.ai](https://accounts.atxp.ai)
2. **Copy your connection string** in the format: `https://accounts.atxp.ai?connection_token=your_token`
3. **Add it to your environment**:
   ```env
   ATXP_CONNECTION_STRING=https://accounts.atxp.ai?connection_token=your_token
   ```
4. **Deploy your changes** with `wrangler secret put ATXP_CONNECTION_STRING`

#### Using Image Generation

Simply ask the AI to generate images:

```
"Generate an image of a sunset over mountains"
"Create a logo for a coffee shop"
"Make a picture of a robot playing chess"
```

The system will:

1. Start the image generation task
2. Show you the task ID and status
3. Notify you with a chat message when payment is processed
4. Poll for completion automatically every 10 seconds
5. Notify you when complete with the image displayed inline
6. Handle any errors gracefully

#### Available Image Commands

- **Generate images**: "Generate an image of..." or "Create a picture of..."
- **Check status**: "Check image status" (shows all tasks)
- **List tasks**: "List my image generation tasks"

#### Connection String Management

You can provide ATXP connection strings in multiple ways:

1. **Environment variable** (recommended for production):

   ```env
   ATXP_CONNECTION_STRING=https://accounts.atxp.ai?connection_token=your_token
   ```

2. **Dynamic in chat**: Provide the connection string when generating images:
   ```
   "Generate an image of a cat using https://accounts.atxp.ai?connection_token=your_token"
   ```

The system prioritizes dynamically provided connection strings over environment variables.

### Use a different AI model provider

The starting [`server.ts`](https://github.com/cloudflare/agents-starter/blob/main/src/server.ts) implementation uses the [`ai-sdk`](https://sdk.vercel.ai/docs/introduction) and the [OpenAI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/openai), but you can use any AI model provider by:

1. Installing an alternative AI provider for the `ai-sdk`, such as the [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai) or [`anthropic`](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic) provider:
2. Replacing the AI SDK with the [OpenAI SDK](https://github.com/openai/openai-node)
3. Using the Cloudflare [Workers AI + AI Gateway](https://developers.cloudflare.com/ai-gateway/providers/workersai/#workers-binding) binding API directly

For example, to use the [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai), install the package:

```sh
npm install workers-ai-provider
```

Add an `ai` binding to `wrangler.jsonc`:

```jsonc
// rest of file
  "ai": {
    "binding": "AI"
  }
// rest of file
```

Replace the `@ai-sdk/openai` import and usage with the `workers-ai-provider`:

```diff
// server.ts
// Change the imports
- import { openai } from "@ai-sdk/openai";
+ import { createWorkersAI } from 'workers-ai-provider';

// Create a Workers AI instance
+ const workersai = createWorkersAI({ binding: env.AI });

// Use it when calling the streamText method (or other methods)
// from the ai-sdk
- const model = openai("gpt-4o-2024-11-20");
+ const model = workersai("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b")
```

Commit your changes and then run the `agents-starter` as per the rest of this README.

### Modifying the UI

The chat interface is built with React and can be customized in `app.tsx`:

- Modify the theme colors in `styles.css`
- Add new UI components in the chat container
- Customize message rendering and tool confirmation dialogs
- Add new controls to the header

### Example Use Cases

1. **Customer Support Agent**
   - Add tools for:
     - Ticket creation/lookup
     - Order status checking
     - Product recommendations
     - FAQ database search

2. **Development Assistant**
   - Integrate tools for:
     - Code linting
     - Git operations
     - Documentation search
     - Dependency checking

3. **Data Analysis Assistant**
   - Build tools for:
     - Database querying
     - Data visualization
     - Statistical analysis
     - Report generation

4. **Personal Productivity Assistant**
   - Implement tools for:
     - Task scheduling with flexible timing options
     - One-time, delayed, and recurring task management
     - Task tracking with reminders
     - Email drafting
     - Note taking

5. **Scheduling Assistant**
   - Build tools for:
     - One-time event scheduling using specific dates
     - Delayed task execution (e.g., "remind me in 30 minutes")
     - Recurring tasks using cron patterns
     - Task payload management
     - Flexible scheduling patterns

6. **Creative Content Assistant**
   - Build tools for:
     - AI image generation with ATXP integration
     - Text content creation and editing
     - Visual asset management and storage
     - Creative project collaboration
     - Automated content workflows

Each use case can be implemented by:

1. Adding relevant tools in `tools.ts`
2. Customizing the UI for specific interactions
3. Extending the agent's capabilities in `server.ts`
4. Adding any necessary external API integrations

## Learn More

- [`agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/README.md)
- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

## License

MIT
