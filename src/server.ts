import { routeAgentRequest, type Schedule } from "agents";

import { getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
import { cloudflareWorkersFetch } from "./tools/imageGeneration";
import {
  findATXPAccount,
  imageService,
  type ATXPPayment,
  type MCPToolResult,
  type ImageGenerationTask
} from "./utils/atxp";
import { atxpClient } from "@atxp/client";
// Removed unused import
// import { env } from "cloudflare:workers";

const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful AI assistant that can generate images from text prompts using ATXP's image generation service.

I have access to the following image generation capabilities:
- generateImage: Create images from text prompts using ATXP Image MCP server
- getImageGenerationStatus: Check the status of a specific image generation task (requires taskId)
- listImageGenerationTasks: List all image generation tasks

CRITICAL RULES FOR IMAGE GENERATION:
1. When a user asks to generate or create an image:
   - Use ONLY the generateImage tool with their description as the prompt
   - After starting, inform the user they'll be automatically notified when complete
   - DO NOT call any other image tools after generateImage

2. When a user asks to "check status" or "check image status" WITHOUT specifying a task ID:
   - Use listImageGenerationTasks to show all tasks
   - DO NOT call generateImage or getImageGenerationStatus
   - DO NOT generate new images

3. When a user asks to check status WITH a specific task ID:
   - Use getImageGenerationStatus with that taskId
   - DO NOT call generateImage

4. NEVER call getImageGenerationStatus without a specific taskId
5. NEVER call generateImage when user asks to check status

The system has automatic background polling that will:
- Check image generation status every 10 seconds automatically
- Send completion notifications with inline image display when ready
- Handle any errors or failures automatically

ATXP Connection Strings:
- If no global connection string is set, users can provide it in the URL format: https://accounts.atxp.ai?connection_token=ABC123DEF456
- Connection strings can be obtained from https://accounts.atxp.ai

I can also schedule tasks for later execution.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }

  /**
   * Poll for image generation task completion
   * This method is scheduled to run periodically for active image generation tasks
   */
  async pollImageGenerationTask(params: {
    requestId: string;
    taskId: string;
    atxpConnectionString: string;
  }) {
    const { taskId, atxpConnectionString } = params;

    try {
      let taskData: ImageGenerationTask | null = null;

      try {
        // @ts-expect-error - Durable Objects storage returns unknown type
        const storageResult = await this.state.storage.get(
          `imageTask:${taskId}`
        );
        taskData = storageResult as unknown as ImageGenerationTask | null;
      } catch (_storageError) {
        // Storage failed - continue without storage data
        taskData = null;
      }

      if (!taskData) {
        // Create a minimal task for polling when storage fails
        taskData = {
          id: taskId,
          prompt: "Generated image",
          status: "running" as const,
          taskId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }

      if (taskData.status !== "running") {
        // Task is not running anymore, stop polling
        return;
      }

      // Get ATXP account with custom fetch function
      const account = findATXPAccount(
        atxpConnectionString,
        cloudflareWorkersFetch
      );

      // Create ATXP Image client
      let imageClient: Awaited<ReturnType<typeof atxpClient>>;
      try {
        imageClient = await atxpClient({
          mcpServer: imageService.mcpServer,
          account: account,
          fetchFn: cloudflareWorkersFetch,
          oAuthChannelFetch: cloudflareWorkersFetch,
          onPayment: async ({ payment }: { payment: ATXPPayment }) => {
            // Send broadcast for real-time updates
            await this.broadcast(
              JSON.stringify({
                type: "payment-update",
                taskId: taskId,
                payment: {
                  accountId: payment.accountId,
                  resourceUrl: payment.resourceUrl,
                  resourceName: payment.resourceName,
                  network: payment.network,
                  currency: payment.currency,
                  amount: payment.amount.toString(),
                  iss: payment.iss
                }
              })
            );

            // Add payment notification message to chat
            try {
              await this.saveMessages([
                ...this.messages,
                {
                  id: generateId(),
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: `💳 **Payment Processed During Image Generation**

A payment has been processed for your ongoing image generation (Task ID: ${taskId}):
- **Amount:** ${payment.amount.toString()} ${payment.currency}
- **Network:** ${payment.network}
- **Service:** ${payment.resourceName}

Your image generation continues processing...`
                    }
                  ],
                  metadata: {
                    createdAt: new Date()
                  }
                }
              ]);
            } catch (messageError) {
              console.error(
                `Failed to add payment message for ${taskId}:`,
                messageError
              );
            }
          }
        });
      } catch (error) {
        console.error("[POLLING] Failed to create image client:", error);
        return;
      }

      // Check the status of the image generation
      const statusResult = await imageClient.callTool({
        name: imageService.getImageAsyncToolName,
        arguments: { taskId }
      });

      const { status, url } = imageService.getAsyncStatusResult(
        statusResult as MCPToolResult
      );

      if (status === "completed" && url) {
        // Update task with completed status
        taskData.status = "completed";
        taskData.imageUrl = url;
        taskData.updatedAt = new Date();

        // Try to save updated task data (but don't fail if storage doesn't work)
        try {
          // @ts-expect-error - taskData type assertion issue with Durable Objects storage
          await this.state.storage.put(
            `imageTask:${taskId}`,
            taskData as ImageGenerationTask
          );
        } catch (_storageError) {
          // Storage update failed, but continue anyway
        }

        // Send final completion update
        try {
          await this.broadcast(
            JSON.stringify({
              type: "image-generation-completed",
              taskId: taskId,
              imageUrl: taskData.imageUrl,
              fileName: taskData.fileName,
              message: `✅ Image generation completed! Your image "${taskData.prompt}" is ready.`
            })
          );
        } catch (_broadcastError) {
          // Broadcast failed, but continue anyway
        }

        // Add completion message to chat
        try {
          await this.saveMessages([
            ...this.messages,
            {
              id: generateId(),
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: `🎨 **Image Generation Complete!**

Your image for "${taskData.prompt}" has been generated successfully!

![Image](${taskData.imageUrl})
**Image URL:** ${taskData.imageUrl}
${taskData.fileName ? `**File Name:** ${taskData.fileName}` : ""}

The image generation process is now complete.`
                }
              ],
              metadata: {
                createdAt: new Date()
              }
            }
          ]);
        } catch (messageError) {
          console.error(
            `Failed to add completion message for ${taskId}:`,
            messageError
          );
        }

        // Stop polling this completed task
        return;
      } else if (status === "failed") {
        // Update task status to failed
        taskData.status = "failed";
        taskData.updatedAt = new Date();

        try {
          // @ts-expect-error - taskData type assertion issue with Durable Objects storage
          await this.state.storage.put(
            `imageTask:${taskId}`,
            taskData as ImageGenerationTask
          );
        } catch (_storageError) {
          // Storage update failed, but continue anyway
        }

        // Send failure update
        await this.broadcast(
          JSON.stringify({
            type: "image-generation-failed",
            taskId,
            message: `❌ Image generation failed for "${taskData.prompt}"`
          })
        );

        // Stop polling this failed task
        return;
      } else if (status === "running") {
        // Still processing, schedule another check in 10 seconds
        this.schedule(
          new Date(Date.now() + 10000), // Check again in 10 seconds
          "pollImageGenerationTask",
          params
        );

        // Send periodic progress update
        await this.broadcast(
          JSON.stringify({
            type: "image-generation-progress",
            taskId,
            message: `🔄 Still generating image for "${taskData.prompt}"...`
          })
        );
      }
    } catch (error) {
      console.error(`Error polling for task ${taskId}:`, error);

      // Schedule retry in 15 seconds on error
      this.schedule(
        new Date(Date.now() + 15000),
        "pollImageGenerationTask",
        params
      );

      // Send error update
      await this.broadcast(
        JSON.stringify({
          type: "image-generation-error",
          taskId,
          message: `⚠️ Error checking image generation status. Retrying...`
        })
      );
    }
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!env.OPENAI_API_KEY) {
      // Note: Using console.error here is acceptable as this runs in the worker entry point
      // where console methods are available and this is a critical startup error
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
