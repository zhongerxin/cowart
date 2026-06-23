#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { normalizeImageMap } from '../src/imageMap.js'

const DEFAULT_LAYOUT_SOURCE = {
  kind: 'generation-layout',
  description: 'Derived from the Cowart image generation layout contract.',
}

function usage() {
  return `Usage:
  node scripts/cowart-image-map.mjs validate --input <image-map.json> [--out <normalized.json>]
  node scripts/cowart-image-map.mjs from-layout --layout <layout.json> [--out <normalized.json>]

Input formats:
  validate     Accepts a cowartImageMap object, or an object with cowartImageMap/imageMap.
  from-layout  Accepts a cowartImageMap object, an imageMap object, or { regions, source? }.`
}

function parseOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    const key = arg.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      options[key] = true
    } else {
      options[key] = next
      index += 1
    }
  }
  return options
}

async function readJsonFile(filePath) {
  const absolutePath = resolve(String(filePath))
  const raw = await readFile(absolutePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Could not parse JSON in ${absolutePath}: ${error.message}`)
  }
}

function imageMapFromValidateInput(input) {
  if (input?.cowartImageMap) return input.cowartImageMap
  if (input?.imageMap) return input.imageMap
  return input
}

function imageMapFromLayoutInput(input) {
  if (input?.cowartImageMap) return input.cowartImageMap
  if (input?.imageMap) return input.imageMap
  if (Array.isArray(input?.regions)) {
    return {
      version: input.version ?? 1,
      source: input.source ?? DEFAULT_LAYOUT_SOURCE,
      generatedAt: input.generatedAt,
      regions: input.regions,
    }
  }
  if (Array.isArray(input?.layout?.regions)) {
    return {
      version: input.layout.version ?? input.version ?? 1,
      source: input.layout.source ?? input.source ?? DEFAULT_LAYOUT_SOURCE,
      generatedAt: input.layout.generatedAt ?? input.generatedAt,
      regions: input.layout.regions,
    }
  }
  throw new Error('Layout input must include cowartImageMap, imageMap, regions, or layout.regions.')
}

async function writeJsonOutput(imageMap, outPath) {
  const serialized = `${JSON.stringify(imageMap, null, 2)}\n`
  if (outPath) {
    await writeFile(resolve(String(outPath)), serialized, 'utf8')
  } else {
    process.stdout.write(serialized)
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const options = parseOptions(rest)

  if (command === 'validate') {
    if (!options.input) throw new Error('validate requires --input <image-map.json>.')
    const input = await readJsonFile(options.input)
    const imageMap = normalizeImageMap(imageMapFromValidateInput(input))
    await writeJsonOutput(imageMap, options.out)
    return
  }

  if (command === 'from-layout') {
    if (!options.layout) throw new Error('from-layout requires --layout <layout.json>.')
    const input = await readJsonFile(options.layout)
    const imageMap = normalizeImageMap(imageMapFromLayoutInput(input))
    await writeJsonOutput(imageMap, options.out)
    return
  }

  if (command === '--help' || command === '-h' || !command) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`)
}

main().catch((error) => {
  process.stderr.write(`cowart-image-map: ${error.message}\n`)
  process.exitCode = 1
})
