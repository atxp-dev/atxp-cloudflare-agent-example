import { tool } from "ai";
import { z } from "zod/v3";
import { getCurrentAgent } from "agents";
import type { Chat } from "../server";
import {
  getATXPConnectionString,
  findATXPAccount,
  imageService,
  type ATXPPayment
} from "../utils/atxp";
import { atxpClient } from "@atxp/client";
import { ConsoleLogger, LogLevel } from "@atxp/common";

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
 * Generate an image from a text prompt using ATXP Image MCP server
 * This tool executes automatically and handles the async image generation process
 */
export const generateImage = tool({
  description:
    "Generate an image from a text prompt using ATXP's AI image generation service",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe("The text prompt describing the image to generate"),
    connectionString: z
      .string()
      .optional()
      .describe(
        "ATXP connection string - either URL format (https://accounts.atxp.ai?connection_token=...) or JSON format (if not set in environment)"
      )
  }),
  execute: async ({ prompt, connectionString }) => {
    const { agent } = getCurrentAgent<Chat>();

    if (!prompt || prompt.trim() === "") {
      return "Error: Image prompt cannot be empty";
    }

    const requestId = Date.now().toString();
    const taskData: ImageGenerationTask = {
      id: requestId,
      prompt: prompt.trim(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      // Get ATXP connection string and account
      const atxpConnectionString = getATXPConnectionString(connectionString);
      const account = findATXPAccount(atxpConnectionString);

      // Store initial task state
      await agent!.state.storage.put(`imageTask:${requestId}`, taskData as any);

      // Send progress update
      await (agent!.broadcast as any)({
        type: "image-generation-started",
        taskId: requestId,
        prompt: prompt,
        message: "Starting image generation..."
      });

      // Create ATXP Image client
      const imageClient = await atxpClient({
        mcpServer: imageService.mcpServer,
        account: account,
        logger: new ConsoleLogger({ level: LogLevel.DEBUG }),
        onPayment: async ({ payment }: { payment: ATXPPayment }) => {
          console.log("Payment made to image service:", payment);
          await (agent!.broadcast as any)({
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

      // Start async image generation
      const asyncResult = await imageClient.callTool({
        name: imageService.createImageAsyncToolName,
        arguments: imageService.getArguments(prompt)
      });

      const { taskId } = imageService.getAsyncCreateResult(asyncResult);
      console.log("Async image generation started with task ID:", taskId);

      // Update task with processing status
      taskData.taskId = taskId;
      taskData.status = "processing";
      taskData.updatedAt = new Date();
      await agent!.state.storage.put(`imageTask:${requestId}`, taskData as any);

      // Send progress update
      await (agent!.broadcast as any)({
        type: "image-generation-processing",
        taskId: requestId,
        atxpTaskId: taskId,
        message: `Image generation started (Task ID: ${taskId})`
      });

      // Schedule background polling for this task
      agent!.schedule(
        new Date(Date.now() + 5000), // Start polling in 5 seconds
        "pollImageGenerationTask",
        { requestId, taskId, atxpConnectionString }
      );

      return `🎨 Image generation started successfully! 
      
**Task ID:** ${requestId}
**ATXP Task ID:** ${taskId}
**Prompt:** "${prompt}"
**Status:** Processing

I'll keep you updated on the progress. This usually takes 1-2 minutes to complete.`;
    } catch (error) {
      console.error(`Error starting image generation:`, error);

      // Update task status to failed
      taskData.status = "failed";
      taskData.updatedAt = new Date();
      await agent!.state.storage.put(`imageTask:${requestId}`, taskData as any);

      // Send error update
      await (agent!.broadcast as any)({
        type: "image-generation-error",
        taskId: requestId,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      return `❌ Failed to start image generation: ${errorMessage}`;
    }
  }
});

/**
 * Get the status of an image generation task
 */
export const getImageGenerationStatus = tool({
  description: "Get the status of a previously started image generation task",
  inputSchema: z.object({
    taskId: z.string().describe("The task ID returned from generateImage")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const taskData = (await agent!.state.storage.get<ImageGenerationTask>(
        `imageTask:${taskId}`
      )) as ImageGenerationTask | null;

      if (!taskData) {
        return `❌ No image generation task found with ID: ${taskId}`;
      }

      const statusEmoji: Record<string, string> = {
        pending: "⏳",
        processing: "🔄",
        completed: "✅",
        failed: "❌"
      };
      const emoji = statusEmoji[taskData.status] || "❓";

      let response = `${emoji} **Image Generation Status**

**Task ID:** ${taskData.id}
**Prompt:** "${taskData.prompt}"
**Status:** ${taskData.status}
**Created:** ${taskData.createdAt.toISOString()}
**Updated:** ${taskData.updatedAt.toISOString()}`;

      if (taskData.taskId) {
        response += `\n**ATXP Task ID:** ${taskData.taskId}`;
      }

      if (taskData.status === "completed" && taskData.imageUrl) {
        response += `\n**Image URL:** ${taskData.imageUrl}`;
        if (taskData.fileName) {
          response += `\n**File Name:** ${taskData.fileName}`;
        }
      }

      return response;
    } catch (error) {
      console.error(`Error getting task status:`, error);
      return `❌ Error retrieving task status: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }
});

/**
 * List all image generation tasks for this agent
 */
export const listImageGenerationTasks = tool({
  description:
    "List all image generation tasks (completed, in progress, and failed)",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const allKeys = (await agent!.state.storage.list({
        prefix: "imageTask:"
      })) as Map<string, ImageGenerationTask>;

      if (allKeys.size === 0) {
        return "📋 No image generation tasks found.";
      }

      const tasks: ImageGenerationTask[] = [];
      for (const [_, taskData] of allKeys) {
        tasks.push(taskData as ImageGenerationTask);
      }

      // Sort by creation date (newest first)
      tasks.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      let response = `📋 **Image Generation Tasks** (${tasks.length} total)\n\n`;

      tasks.forEach((task, index) => {
        const statusEmoji = {
          pending: "⏳",
          processing: "🔄",
          completed: "✅",
          failed: "❌"
        }[task.status];

        response += `**${index + 1}.** ${statusEmoji} ${task.id}\n`;
        response += `   Prompt: "${task.prompt}"\n`;
        response += `   Status: ${task.status}\n`;
        response += `   Created: ${new Date(task.createdAt).toLocaleString()}\n`;

        if (task.status === "completed" && task.imageUrl) {
          response += `   Image: ${task.imageUrl}\n`;
        }
        response += "\n";
      });

      return response;
    } catch (error) {
      console.error(`Error listing tasks:`, error);
      return `❌ Error listing tasks: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }
});
