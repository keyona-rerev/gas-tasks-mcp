import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

function buildServer() {
  const server = new McpServer({ name: "google-tasks", version: "1.0.0" });

  server.tool("tasks_list_tasklists","List all Google Task lists.",{},async()=>{
    const data=await callGAS("listTasklists");
    return{content:[{type:"text",text:JSON.stringify(data,null,2)}]};
  });

  server.tool("tasks_list","List tasks in a task list.",{tasklistId:z.string(),showCompleted:z.boolean().optional()},async(p)=>{
    const data=await callGAS("listTasks",p);
    return{content:[{type:"text",text:JSON.stringify(data,null,2)}]};
  });

  server.tool("tasks_create","Create a new task.",{tasklistId:z.string(),title:z.string(),notes:z.string().optional(),due:z.string().optional()},async(p)=>{
    const data=await callGAS("createTask",p);
    return{content:[{type:"text",text:JSON.stringify(data,null,2)}]};
  });

  server.tool("tasks_update","Update a task.",{tasklistId:z.string(),taskId:z.string(),title:z.string().optional(),notes:z.string().optional(),due:z.string().optional(),status:z.enum(["needsAction","completed"]).optional()},async(p)=>{
    const data=await callGAS("updateTask",p);
    return{content:[{type:"text",text:JSON.stringify(data,null,2)}]};
  });

  server.tool("tasks_complete","Mark a task completed.",{tasklistId:z.string(),taskId:z.string()},async(p)=>{
    const data=await callGAS("completeTask",p);
    return{content:[{type:"text",text:JSON.stringify(data,null,2)}]};
  });

  server.tool("tasks_delete","Delete a task.",{tasklistId:z.string(),taskId:z.string()},async(p)=>{
    const data=await callGAS("deleteTask",p);
    return{content:[{type:"text",text:JSON.stringify(data,null,2)}]};
  });

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Accept,Mcp-Session-Id"});
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200,{"Content-Type":"application/json"});
    res.end(JSON.stringify({status:"ok",service:"google-tasks-mcp"}));
    return;
  }
  if (req.url === "/mcp") {
    res.setHeader("Access-Control-Allow-Origin","*");
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    await server.connect(transport);
    await transport.handleRequest(req,res);
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT,()=>console.log(`Google Tasks MCP running on port ${PORT}`));
