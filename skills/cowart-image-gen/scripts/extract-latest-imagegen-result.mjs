#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      index += 1
    }
  }
  return args
}

function usage() {
  return `Usage:
  node skills/cowart-image-gen/scripts/extract-latest-imagegen-result.mjs --out /tmp/image.png [--session /path/session.jsonl] [--after ISO_TIMESTAMP]

Extracts the latest built-in image_gen result from a Codex session JSONL file.
The built-in image tool may store PNG base64 in image_generation_call.result
without writing a file under $CODEX_HOME/generated_images.`
}

async function newestJsonlFile(dir) {
  const entries = []

  async function walk(currentDir) {
    for (const entry of await readdir(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const info = await stat(fullPath)
        entries.push({ path: fullPath, mtimeMs: info.mtimeMs })
      }
    }
  }

  await walk(dir)
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return entries[0]?.path ?? null
}

function isPngBase64(value) {
  return typeof value === 'string' && value.startsWith('iVBOR')
}

const args = parseArgs(process.argv.slice(2))

if (args.help || !args.out) {
  console.log(usage())
  process.exit(args.help ? 0 : 2)
}

const codexHome = process.env.CODEX_HOME || join(process.env.HOME || '', '.codex')
const sessionPath = args.session
  ? resolve(String(args.session))
  : await newestJsonlFile(join(codexHome, 'sessions'))

if (!sessionPath) {
  throw new Error(`Could not find a Codex session JSONL file under ${join(codexHome, 'sessions')}`)
}

const afterTime = args.after ? Date.parse(String(args.after)) : null
if (args.after && Number.isNaN(afterTime)) {
  throw new Error(`Invalid --after timestamp: ${args.after}`)
}

const text = await readFile(sessionPath, 'utf8')
let latest = null
for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
  if (!line.trim()) continue
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }

  const payload = event.payload
  if (event.type !== 'response_item' || payload?.type !== 'image_generation_call') continue
  if (payload.status !== 'completed' && payload.status !== 'generating') continue
  if (!isPngBase64(payload.result)) continue

  const timestampMs = Date.parse(event.timestamp || '')
  if (afterTime !== null && (!Number.isFinite(timestampMs) || timestampMs < afterTime)) continue

  latest = {
    id: payload.id || `line-${lineIndex + 1}`,
    line: lineIndex + 1,
    revisedPrompt: payload.revised_prompt || '',
    result: payload.result,
    sessionPath,
    timestamp: event.timestamp || null,
  }
}

if (!latest) {
  throw new Error(`No PNG image_generation_call.result found in ${sessionPath}`)
}

const outPath = resolve(String(args.out))
await mkdir(dirname(outPath), { recursive: true })
const bytes = Buffer.from(latest.result, 'base64')
await writeFile(outPath, bytes)

console.log(JSON.stringify({
  id: latest.id,
  line: latest.line,
  sessionPath: latest.sessionPath,
  timestamp: latest.timestamp,
  outputPath: outPath,
  fileName: basename(outPath),
  bytes: bytes.length,
  revisedPrompt: latest.revisedPrompt,
}, null, 2))
