# 🎨 ATXP Cloudflare Agent - AI Image Generation Demo

![npm i agents command](./npm-agents-banner.svg)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/atxp-dev/atxp-cloudflare-agent-example"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

A demo implementation showing how to integrate [ATXP](https://docs.atxp.ai) with Cloudflare Agents for AI-powered image generation. This project demonstrates text-to-image generation using ATXP's Image MCP server, with real-time progress updates and file storage capabilities.

## Features

- 🎨 **AI Image Generation**: Generate images from text prompts using ATXP Image MCP server
- 💬 **Interactive Chat Interface**: Modern chat UI for natural conversations
- ⚡️ **Real-time Progress Updates**: WebSocket-based progress tracking during image generation
- 📁 **File Storage**: Automatic storage of generated images using ATXP Filestore
- 🔄 **Async Processing**: Background polling for long-running image generation tasks
- 💳 **Payment Tracking**: Real-time display of ATXP payment information
- 📋 **Task Management**: List, check status, and manage image generation tasks
- 🌓 **Dark/Light Theme**: Modern, responsive UI with theme support

## Prerequisites

- Cloudflare account
- OpenAI API key
- ATXP connection string (get from [ATXP Console](https://console.atxp.ai))

## Quick Start

1. **Clone this repository:**

```bash
git clone https://github.com/atxp-dev/atxp-cloudflare-agent-example.git
cd atxp-cloudflare-agent-example
```

2. **Install dependencies:**

```bash
npm install
```

3. **Set up your environment:**

Create a `.dev.vars` file from the example:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your API keys:

```env
OPENAI_API_KEY=your_openai_api_key

# Optional - ATXP connection string (JSON format)
# If not provided, users can provide it when generating images
ATXP_CONNECTION_STRING={"accountId":"your-account-id","privateKey":"your-private-key","network":"mainnet","currency":"ETH"}
```

4. **Run locally:**

```bash
npm start
```

5. **Deploy to Cloudflare:**

```bash
npm run deploy
```

## Usage

### Basic Image Generation

Once the agent is running, you can generate images by chatting with the AI:

- "Generate an image of a sunset over mountains"
- "Create a picture of a futuristic city"
- "Draw a cat wearing a space helmet"

### Advanced Features

The agent provides several tools for managing image generation:

1. **generateImage** - Creates images from text prompts
2. **getImageGenerationStatus** - Checks the status of specific tasks
3. **listImageGenerationTasks** - Shows all image generation tasks

### ATXP Connection String

You can provide your ATXP connection string in two ways:

1. **Environment Variable** (recommended for single-user deployments):

   ```env
   ATXP_CONNECTION_STRING={"accountId":"...","privateKey":"..."}
   ```

2. **Runtime Parameter** (recommended for multi-user scenarios):
   ```
   Generate an image of a dragon with connection string {"accountId":"...","privateKey":"..."}
   ```

## Project Structure

```
├── src/
│   ├── app.tsx                    # Chat UI implementation
│   ├── server.ts                  # Chat agent with ATXP integration
│   ├── tools.ts                   # Tool definitions (includes ATXP tools)
│   ├── tools/
│   │   └── imageGeneration.ts     # ATXP image generation tools
│   ├── utils/
│   │   └── atxp.ts               # ATXP utility functions
│   ├── utils.ts                   # General helper functions
│   └── styles.css                 # UI styling
├── .dev.vars.example             # Environment variables template
└── wrangler.jsonc                # Cloudflare Workers configuration
```

## How It Works

### Image Generation Flow

1. **User Request**: User asks for an image through chat
2. **Tool Execution**: `generateImage` tool is called with the prompt
3. **ATXP Integration**: Creates ATXP Image MCP client and starts async generation
4. **Background Polling**: Agent schedules periodic status checks
5. **Progress Updates**: Real-time WebSocket updates sent to user
6. **File Storage**: Completed images stored in ATXP Filestore
7. **Completion Notification**: Final result delivered to chat

### Key Components

- **ATXP Image MCP Server**: Handles AI image generation
- **ATXP Filestore MCP Server**: Stores and manages generated images
- **Cloudflare Durable Objects**: Persistent state management for tasks
- **WebSocket Broadcasting**: Real-time progress updates
- **Scheduled Tasks**: Background polling for async operations

## ATXP Integration Details

This demo showcases several ATXP capabilities:

### Image Generation

- Text-to-image generation using advanced AI models
- Async processing with task tracking
- Configurable generation parameters

### File Storage

- Automatic storage of generated images
- Public URL generation for easy sharing
- Metadata tracking and file management

### Payment Tracking

- Real-time payment notifications
- Transparent cost tracking
- Multi-network support (Ethereum, Polygon, etc.)

### Account Management

- Secure connection string handling
- Multi-tenant support
- Network and currency configuration

## Deployment

### Cloudflare Workers

1. **Set up secrets:**

```bash
# Copy your environment variables to Cloudflare
wrangler secret bulk .dev.vars
```

2. **Deploy:**

```bash
npm run deploy
```

3. **Configure custom domain (optional):**

Add a custom domain in the Cloudflare Workers dashboard for production use.

### Environment Variables

For production deployment, set these environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key
- `ATXP_CONNECTION_STRING` - Your ATXP connection string (optional)

## Development

### Adding New Image Generation Features

You can extend the image generation capabilities by:

1. **Adding new tools** in `src/tools/imageGeneration.ts`
2. **Modifying generation parameters** in the ATXP client configuration
3. **Customizing progress updates** in the polling logic
4. **Adding image processing features** using additional ATXP services

### Customizing the UI

The chat interface can be customized in `src/app.tsx`:

- Modify progress display components
- Add image preview functionality
- Customize payment information display
- Add task management UI elements

### Error Handling

The implementation includes comprehensive error handling:

- **Connection failures**: Automatic retry logic
- **Payment issues**: Clear error messages and guidance
- **Generation failures**: Status tracking and user notification
- **File storage errors**: Fallback to direct URLs

## Example Use Cases

### Creative Applications

- **Art Generation**: Create custom artwork for projects
- **Design Mockups**: Generate design concepts and prototypes
- **Content Creation**: Produce images for blogs, social media, etc.
- **Educational Material**: Create visual aids and illustrations

### Business Applications

- **Marketing Assets**: Generate promotional images and graphics
- **Product Visualization**: Create product mockups and concepts
- **Presentation Graphics**: Generate charts, diagrams, and visuals
- **Brand Assets**: Create logos, icons, and brand imagery

### Developer Tools

- **UI Mockups**: Generate interface concepts and wireframes
- **Documentation Images**: Create technical diagrams and screenshots
- **Testing Assets**: Generate test images for applications
- **Demo Content**: Create sample images for showcases

## Learn More

### ATXP Resources

- [ATXP Documentation](https://docs.atxp.ai)
- [ATXP Console](https://console.atxp.ai)
- [ATXP Express Example](https://github.com/atxp-dev/atxp-express-example)
- [Image MCP Server Documentation](https://docs.atxp.ai/mcp-servers/image)
- [Filestore MCP Server Documentation](https://docs.atxp.ai/mcp-servers/filestore)

### Cloudflare Resources

- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)

### Related Examples

- [ATXP Express Example](https://github.com/atxp-dev/atxp-express-example) - Similar functionality using Express.js
- [ATXP SDK Examples](https://docs.atxp.ai/examples) - Additional integration examples

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with ATXP services
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ❤️ using [ATXP](https://atxp.ai) and [Cloudflare Agents](https://developers.cloudflare.com/agents/)
