# Deployment Guide

## Quick Deploy

[![Deploy with Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/atxp-dev/atxp-cloudflare-agent-example)

## Manual Deployment

### Prerequisites

1. **Cloudflare Account**: [Sign up](https://dash.cloudflare.com/sign-up) for a free Cloudflare account
2. **OpenAI API Key**: Get your API key from [OpenAI](https://platform.openai.com/api-keys)
3. **ATXP Account**: Get your connection string from [ATXP Console](https://console.atxp.ai)

### Local Development

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/atxp-dev/atxp-cloudflare-agent-example.git
   cd atxp-cloudflare-agent-example
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .dev.vars.example .dev.vars
   ```
   
   Edit `.dev.vars`:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   ATXP_CONNECTION_STRING={"accountId":"your-account-id","privateKey":"your-private-key"}
   ```

3. **Start development server:**
   ```bash
   npm start
   ```
   
   Visit http://localhost:5173 to test the agent.

### Production Deployment

1. **Install Wrangler CLI:**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Set production secrets:**
   ```bash
   wrangler secret bulk .dev.vars
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

5. **Custom domain (optional):**
   - Go to Cloudflare Workers dashboard
   - Click on your deployed worker
   - Go to "Settings" > "Triggers" 
   - Add a custom domain

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | Your OpenAI API key for chat functionality |
| `ATXP_CONNECTION_STRING` | ❌ | ATXP account connection string (JSON format) |

**Note**: If `ATXP_CONNECTION_STRING` is not set, users must provide it when requesting image generation.

### Testing Your Deployment

1. Open your deployed URL
2. Start a conversation with: "Generate an image of a sunset"
3. If no connection string is set globally, include it: 
   "Generate an image of a dragon with connection string {your-connection-string}"

### Troubleshooting

#### Common Issues

1. **"OPENAI_API_KEY is not set"**
   - Ensure you've run `wrangler secret bulk .dev.vars`
   - Verify the key is correctly formatted in `.dev.vars`

2. **"ATXP connection string is required"**
   - Add `ATXP_CONNECTION_STRING` to `.dev.vars` or provide it in the chat

3. **"Payment made to..." messages**
   - This is normal - ATXP shows payment information for transparency
   - Each image generation costs a small amount of cryptocurrency

4. **Image generation taking a long time**
   - Image generation typically takes 1-2 minutes
   - Progress updates are sent via WebSocket
   - Check browser console for detailed logs

#### Monitoring

- **Worker Logs**: View in Cloudflare Workers dashboard > "Logs" tab
- **Analytics**: Check usage statistics in the "Analytics" tab
- **Performance**: Monitor execution time and requests

### Production Considerations

1. **Rate Limiting**: Consider implementing rate limits for production use
2. **Authentication**: Add user authentication for multi-user deployments  
3. **CORS**: Adjust CORS settings for your specific domains
4. **Monitoring**: Set up alerts for errors and unusual usage patterns
5. **Costs**: Monitor both Cloudflare Workers and ATXP usage costs

### Support

- **ATXP Documentation**: https://docs.atxp.ai
- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **Issues**: https://github.com/atxp-dev/atxp-cloudflare-agent-example/issues