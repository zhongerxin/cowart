#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

const DEFAULT_MODEL = "wan2.7-image-pro";
const DEFAULT_REGION = "cn-beijing";
const DEFAULT_SIZE = "2K";

function printUsage() {
  console.error(`Usage:
  node scripts/generate-dashscope-image.mjs --prompt "..." [--width 512 --height 683]
  node scripts/generate-dashscope-image.mjs --prompt-file prompt.txt --size 2K --out-dir generated

Environment:
  DASHSCOPE_API_KEY              Required.
  DASHSCOPE_BASE_URL             Preferred, e.g. https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1
  DASHSCOPE_WORKSPACE_ID         Used when DASHSCOPE_BASE_URL is not set.
  DASHSCOPE_REGION               Defaults to cn-beijing.
  COWART_DASHSCOPE_IMAGE_MODEL   Defaults to wan2.7-image-pro.
  COWART_DASHSCOPE_IMAGE_SIZE    Defaults to 2K when width/height are not provided.`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function readDashscopeConfig() {
  const explicitConfig = nonEmptyString(process.env.COWART_DASHSCOPE_CONFIG);
  const configDir =
    nonEmptyString(process.env.COWART_CONFIG_DIR) ||
    (nonEmptyString(process.env.APPDATA) ? join(process.env.APPDATA, "Cowart") : join(homedir(), ".cowart"));
  const configPath = explicitConfig || join(configDir, "dashscope-config.json");

  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeFileName(value, fallback = "dashscope-image.png") {
  const raw = basename(String(value || fallback));
  const ext = extname(raw) || ".png";
  const base = raw
    .slice(0, raw.length - extname(raw).length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "dashscope-image"}${ext}`;
}

function roundToMultiple(value, multiple) {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function customSizeForDimensions(width, height, maxSide = 4096) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  let nextWidth = width;
  let nextHeight = height;
  const minSide = Math.min(nextWidth, nextHeight);
  if (minSide < 768) {
    const scale = 768 / minSide;
    nextWidth *= scale;
    nextHeight *= scale;
  }

  const largestSide = Math.max(nextWidth, nextHeight);
  if (largestSide > maxSide) {
    const scale = maxSide / largestSide;
    nextWidth *= scale;
    nextHeight *= scale;
  }

  nextWidth = roundToMultiple(nextWidth, 16);
  nextHeight = roundToMultiple(nextHeight, 16);

  const ratio = Math.max(nextWidth, nextHeight) / Math.min(nextWidth, nextHeight);
  if (ratio > 8) {
    throw new Error(`DashScope image size ratio must be within 1:8 to 8:1, got ${nextWidth}*${nextHeight}.`);
  }

  return `${nextWidth}*${nextHeight}`;
}

function resolveBaseUrl(config = {}) {
  const explicitBaseUrl = nonEmptyString(process.env.DASHSCOPE_BASE_URL) || nonEmptyString(config.baseUrl);
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/+$/, "");

  const workspaceId = nonEmptyString(process.env.DASHSCOPE_WORKSPACE_ID);
  if (!workspaceId) {
    throw new Error("Set DASHSCOPE_BASE_URL or DASHSCOPE_WORKSPACE_ID before using the DashScope image provider.");
  }

  const region = nonEmptyString(process.env.DASHSCOPE_REGION) || DEFAULT_REGION;
  return `https://${workspaceId}.${region}.maas.aliyuncs.com/api/v1`;
}

function findImageUrl(payload) {
  const content = payload?.output?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const item = content.find((entry) => nonEmptyString(entry?.image));
    if (item) return item.image;
  }

  const legacyUrl = payload?.output?.results?.[0]?.url || payload?.output?.url;
  if (nonEmptyString(legacyUrl)) return legacyUrl;

  return null;
}

async function readPrompt(args) {
  const prompt = nonEmptyString(args.prompt);
  if (prompt) return prompt;

  const promptFile = nonEmptyString(args["prompt-file"]);
  if (promptFile) {
    return await import("node:fs/promises").then(({ readFile }) => readFile(resolve(promptFile), "utf8"));
  }

  throw new Error("A prompt is required. Pass --prompt or --prompt-file.");
}

async function downloadImage(imageUrl, outputPath) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download generated image: ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const dashscopeConfig = await readDashscopeConfig();
  const apiKey = nonEmptyString(process.env.DASHSCOPE_API_KEY) || nonEmptyString(dashscopeConfig.apiKey);
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is required.");

  const prompt = await readPrompt(args);
  const model =
    nonEmptyString(args.model) ||
    nonEmptyString(process.env.COWART_DASHSCOPE_IMAGE_MODEL) ||
    nonEmptyString(process.env.COWART_IMAGE_MODEL) ||
    nonEmptyString(dashscopeConfig.model) ||
    DEFAULT_MODEL;
  const width = Number(args.width);
  const height = Number(args.height);
  const size =
    nonEmptyString(args.size) ||
    customSizeForDimensions(width, height, model === "wan2.7-image-pro" ? 4096 : 2048) ||
    nonEmptyString(process.env.COWART_DASHSCOPE_IMAGE_SIZE) ||
    DEFAULT_SIZE;

  const outDir = resolve(nonEmptyString(args["out-dir"]) || nonEmptyString(process.env.COWART_GENERATED_IMAGE_DIR) || "generated-images");
  await mkdir(outDir, { recursive: true });

  const outputName = safeFileName(nonEmptyString(args.output) || `dashscope-${model}-${timestamp()}.png`);
  const outputPath = resolve(outDir, outputName);
  const endpoint = `${resolveBaseUrl(dashscopeConfig)}/services/aigc/multimodal-generation/generation`;

  const body = {
    model,
    input: {
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],
    },
    parameters: {
      size,
      n: Number(args.n) || 1,
      watermark: args.watermark === "true",
    },
  };

  if (model === "wan2.7-image-pro" || model === "wan2.7-image") {
    body.parameters.thinking_mode = args["thinking-mode"] === undefined ? true : args["thinking-mode"] !== "false";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`DashScope returned non-JSON response: ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(`DashScope request failed: ${response.status} ${response.statusText}: ${text.slice(0, 1000)}`);
  }

  const imageUrl = findImageUrl(payload);
  if (!imageUrl) {
    throw new Error(`DashScope response did not include an image URL: ${JSON.stringify(payload).slice(0, 1000)}`);
  }

  await downloadImage(imageUrl, outputPath);

  const result = {
    provider: "dashscope",
    model,
    size,
    imageUrl,
    outputPath,
    responseId: payload?.request_id || payload?.requestId || null,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
