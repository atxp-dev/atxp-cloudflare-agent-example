import { routeAgentRequest, type Schedule } from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

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
import {
  findATXPAccount,
  imageService,
  filestoreService,
  type ATXPPayment
} from "./utils/atxp";
import { atxpClient } from "@atxp/client";
import { ConsoleLogger, LogLevel } from "@atxp/common";
// import { env } from "cloudflare:workers";

const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Image generation task interface for state management
 */
interface ImageGenerationTask {
  id: string;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  taskId?: string;
  imageUrl?: string;
  fileName?: string;
  fileId?: string;
  createdAt: Date;
  updatedAt: Date;
}

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
- getImageGenerationStatus: Check the status of image generation tasks  
- listImageGenerationTasks: List all image generation tasks

When a user asks to generate or create an image, use the generateImage tool with their description as the prompt.

ATXP Connection Strings:
- If no global connection string is set, users can provide it in the URL format: https://accounts.atxp.ai?connection_token=ABC123DEF456
- Connection strings can be obtained from https://console.atxp.ai
- Both URL format (https://accounts.atxp.ai?connection_token=...) and legacy JSON format are supported

I can also schedule tasks for later execution.

${unstable_getSchedulePrompt({ date: new Date() })}

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
    const { requestId, taskId, atxpConnectionString } = params;

    try {
      // Get the current task data
      const taskData = (await this.state.storage.get<ImageGenerationTask>(
        `imageTask:${requestId}`
      )) as ImageGenerationTask | null;

      if (!taskData || taskData.status !== "processing") {
        console.log(
          `Task ${requestId} is not in processing state, stopping polling`
        );
        return;
      }

      // Get ATXP account
      const account = findATXPAccount(atxpConnectionString);

      // Create ATXP Image client
      const imageClient = await atxpClient({
        mcpServer: imageService.mcpServer,
        account: account,
        logger: new ConsoleLogger({ level: LogLevel.DEBUG }),
        onPayment: async ({ payment }: { payment: ATXPPayment }) => {
          console.log("Payment made to image service during polling:", payment);
          await (this.broadcast as any)({
            type: "payment-update",
            taskId: requestId,
            payment: {
              accountId: payment.accountId,
              resourceUrl: payment.resourceUrl,
              resourceName: payment.resourceName,
              network: payment.network,
              currency: payment.currency,
              amount: payment.amount.toString(),
              iss: payment.iss
            }
          });
        }
      });

      // Check the status of the image generation
      const statusResult = await imageClient.callTool({
        name: imageService.getImageAsyncToolName,
        arguments: { taskId }
      });

      const { status, url } = imageService.getAsyncStatusResult(statusResult);
      console.log(`Task ${taskId} status:`, status);

      if (status === "completed" && url) {
        console.log(`Task ${taskId} completed successfully. URL:`, url);

        // Update task with completed status
        taskData.status = "completed";
        taskData.imageUrl = url;
        taskData.updatedAt = new Date();

        // Try to store in filestore
        try {
          // Send progress update for file storage
          await (this.broadcast as any)({
            type: "image-generation-storing",
            taskId: requestId,
            message: "Storing image in ATXP Filestore..."
          });

          // Create filestore client
          const filestoreClient = await atxpClient({
            mcpServer: filestoreService.mcpServer,
            account: account,
            onPayment: async ({ payment }: { payment: ATXPPayment }) => {
              console.log("Payment made to filestore:", payment);
              await (this.broadcast as any)({
                type: "payment-update",
                taskId: requestId,
                payment: {
                  accountId: payment.accountId,
                  resourceUrl: payment.resourceUrl,
                  resourceName: payment.resourceName,
                  network: payment.network,
                  currency: payment.currency,
                  amount: payment.amount.toString(),
                  iss: payment.iss
                }
              });
            }
          });

          const filestoreResult = await filestoreClient.callTool({
            name: filestoreService.toolName,
            arguments: filestoreService.getArguments(url)
          });

          const fileResult = filestoreService.getResult(filestoreResult);
          taskData.fileName = fileResult.filename;
          taskData.imageUrl = fileResult.url; // Use filestore URL instead
          taskData.fileId = fileResult.fileId || fileResult.filename;

          console.log("Filestore result:", fileResult);
        } catch (filestoreError) {
          console.error(
            "Error with filestore, using direct image URL:",
            filestoreError
          );

          // Send filestore warning but continue with direct URL
          await (this.broadcast as any)({
            type: "image-generation-warning",
            taskId: requestId,
            message: "Image ready! Filestore unavailable, using direct URL."
          });
        }

        // Save updated task data
        await this.state.storage.put(`imageTask:${requestId}`, taskData as any);

        // Send final completion update
        await (this.broadcast as any)({
          type: "image-generation-completed",
          taskId: requestId,
          imageUrl: taskData.imageUrl,
          fileName: taskData.fileName,
          message: `✅ Image generation completed! Your image "${taskData.prompt}" is ready.`
        });

        // Add completion message to chat
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
      } else if (status === "failed") {
        console.error(`Task ${taskId} failed`);

        // Update task status to failed
        taskData.status = "failed";
        taskData.updatedAt = new Date();
        await this.state.storage.put(`imageTask:${requestId}`, taskData as any);

        // Send failure update
        await (this.broadcast as any)({
          type: "image-generation-failed",
          taskId: requestId,
          message: `❌ Image generation failed for "${taskData.prompt}"`
        });
      } else if (status === "processing") {
        // Still processing, schedule another check in 10 seconds
        this.schedule(
          new Date(Date.now() + 10000), // Check again in 10 seconds
          "pollImageGenerationTask",
          params
        );

        // Send periodic progress update
        await (this.broadcast as any)({
          type: "image-generation-progress",
          taskId: requestId,
          message: `🔄 Still generating image for "${taskData.prompt}"...`
        });
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
      await this.broadcast({
        type: "image-generation-error",
        taskId: requestId,
        message: `⚠️ Error checking image generation status. Retrying...`
      });
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
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!process.env.OPENAI_API_KEY) {
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
