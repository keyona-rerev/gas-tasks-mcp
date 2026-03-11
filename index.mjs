import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import fetch from "node-fetch";
import http from "http";

const GAS_URL   = process.env.TASKS_GAS_URL;
const GAS_TOKEN = process.env.TASKS_GAS_TOKEN;
const PORT      = process.env.PORT || 3000;

async function callGAS(action, params = {}) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: GAS_TOKEN, action, ...params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// Store active SSE transports by session ID
const transports = new Map();

function buildServer() {
  const server = new McpServer({ name: "google-tasks", version: "1.0.0" });

  server.tool("tasks_list_tasklists", "List all Google Task lists. Call this first to get tasklistId values needed for other tools.", {}, async () => {
    const data = await callGAS("listTasklists");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_list", "List tasks in a Google Tasks list.", {
    tasklistId: z.string().describe("ID of the task list"),
    showCompleted: z.boolean().optional().describe("Include completed tasks"),
  }, async (p) => {
    const data = await callGAS("listTasks", p);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_create", "Create a new task in a Google Tasks list.", {
    tasklistId: z.string().describe("ID of the task list"),
    title: z.string().describe("Title of the task"),
    notes: z.string().optional().describe("Notes or description"),
    due: z.string().optional().describe("Due date in RFC 3339 format e.g. 2026-03-15T00:00:00.000Z"),
  }, async (p) => {
    const data = await callGAS("createTask", p);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_update", "Update an existing task.", {
    tasklistId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task to update"),
    title: z.string().optional(),
    notes: z.string().optional(),
    due: z.string().optional(),
    status: z.enum(["needsAction", "completed"]).optional(),
  }, async (p) => {
    const data = await callGAS("updateTask", p);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_complete", "Mark a Google Task as completed.", {
    tasklistId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task to complete"),
  }, async (p) => {
    const data = await callGAS("completeTask", p);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_delete", "Permanently delete a task.", {
    tasklistId: z.string().describe("ID of the task list"),
    taskId: z.string().describe("ID of the task to delete"),
  }, async (p) => {
    const data = await callGAS("deleteTask", p);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "google-tasks-mcp" }));
    return;
  }

  // SSE endpoint - client connects here to receive server messages
  if (req.method === "GET" && req.url === "/mcp") {
    const server = buildServer();
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    res.on("close", () => transports.delete(transport.sessionId));
    await server.connect(transport);
    return;
  }

  // Messages endpoint - client POSTs messages here
  if (req.method === "POST" && req.url.startsWith("/messages")) {
    const url = new URL(req.url, `http://localhost`);
    const sessionId = url.searchParams.get("sessionId");
    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`Google Tasks MCP (SSE) running on port ${PORT}`);
});
