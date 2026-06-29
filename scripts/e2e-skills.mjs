#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { promisify } from 'node:util'

import { insertCowartImage } from '../mcp/server.mjs'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const fixturePngPath = join(repoRoot, 'assets', 'app-icon.png')
const cleanupArtifacts = process.argv.includes('--cleanup')
const computerUseSetup = process.argv.includes('--computer-use-setup')
const demoPrompts = {
  'cowart-open-canvas': 'Open the Cowart canvas for this project.',
  'cowart-image-gen': 'Generate a new image into the selected Cowart AI image holder.',
  'cowart-image-edit': 'Use my Cowart annotation screenshot to generate a clean revised image beside the original.',
}
const fixturePngFileSize = 3368
const tldrawSchema = {
  schemaVersion: 2,
  sequences: {
    'com.tldraw.store': 5,
    'com.tldraw.asset': 1,
    'com.tldraw.camera': 1,
    'com.tldraw.document': 2,
    'com.tldraw.instance': 26,
    'com.tldraw.instance_page_state': 5,
    'com.tldraw.page': 1,
    'com.tldraw.instance_presence': 6,
    'com.tldraw.pointer': 1,
    'com.tldraw.shape': 4,
    'com.tldraw.user': 1,
    'com.tldraw.asset.image': 6,
    'com.tldraw.asset.video': 5,
    'com.tldraw.asset.bookmark': 2,
    'com.tldraw.shape.group': 0,
    'com.tldraw.shape.text': 4,
    'com.tldraw.shape.bookmark': 2,
    'com.tldraw.shape.draw': 4,
    'com.tldraw.shape.geo': 11,
    'com.tldraw.shape.note': 12,
    'com.tldraw.shape.line': 5,
    'com.tldraw.shape.frame': 1,
    'com.tldraw.shape.arrow': 8,
    'com.tldraw.shape.highlight': 3,
    'com.tldraw.shape.embed': 4,
    'com.tldraw.shape.image': 5,
    'com.tldraw.shape.video': 4,
    'com.tldraw.binding.arrow': 1,
  },
}

function nowIso() {
  return new Date().toISOString()
}

async function findFreePort() {
  const server = createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const { port } = server.address()
  await new Promise((resolveClose) => server.close(resolveClose))
  return port
}

async function waitForHttp(url, processRef, logBuffer) {
  const deadline = Date.now() + 30000
  let lastError = null
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`Cowart server exited early with code ${processRef.exitCode}.\n${logBuffer.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${response.status} ${response.statusText}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'unknown error'}\n${logBuffer.join('')}`)
}

async function startCowartServer(projectDir, canvasDir) {
  const port = await findFreePort()
  const cowartUrl = `http://127.0.0.1:${port}`
  const logBuffer = []
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        COWART_PROJECT_DIR: projectDir,
        COWART_CANVAS_DIR: canvasDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  child.stdout.on('data', (chunk) => logBuffer.push(chunk.toString()))
  child.stderr.on('data', (chunk) => logBuffer.push(chunk.toString()))
  await waitForHttp(`${cowartUrl}/api/canvas`, child, logBuffer)

  return {
    cowartUrl,
    child,
    logs: () => logBuffer.join(''),
    async stop() {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise((resolveStop) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL')
          resolveStop()
        }, 3000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolveStop()
        })
      })
    },
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return text ? JSON.parse(text) : {}
}

async function putJson(url, payload) {
  return fetchJson(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function writePng(filePath) {
  await mkdir(dirname(filePath), { recursive: true })
  await copyFile(fixturePngPath, filePath)
  return filePath
}

async function discoverSkillNames() {
  const skillsDir = join(repoRoot, 'skills')
  const entries = await readdir(skillsDir, { withFileTypes: true })
  const names = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      await stat(join(skillsDir, entry.name, 'SKILL.md'))
      names.push(entry.name)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  return names.sort()
}

async function assertReadmeDemoPrompts() {
  const readme = await readFile(join(repoRoot, 'README.md'), 'utf8')
  for (const prompt of Object.values(demoPrompts)) {
    assert.ok(readme.includes(prompt), `README.md should include demo prompt: ${prompt}`)
  }
}

function richText(text) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  }
}

function baseSnapshot() {
  return {
    schema: tldrawSchema,
    store: {
      'page:demo': {
        id: 'page:demo',
        typeName: 'page',
        name: 'README Demo',
        index: 'a1',
        meta: {},
      },
      'shape:holder': {
        id: 'shape:holder',
        typeName: 'shape',
        type: 'frame',
        parentId: 'page:demo',
        index: 'a1',
        x: 80,
        y: 80,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {
          cowartAiImageHolder: true,
          cowartAiImageHolderVersion: 1,
        },
        props: {
          w: 512,
          h: 683,
          name: 'AI 图片',
          color: 'blue',
        },
      },
      'asset:original': {
        id: 'asset:original',
        typeName: 'asset',
        type: 'image',
        props: {
          name: 'original.png',
          src: '/page-assets/demo/original.png',
          w: 144,
          h: 144,
          fileSize: fixturePngFileSize,
          mimeType: 'image/png',
          isAnimated: false,
        },
        meta: {},
      },
      'shape:original': {
        id: 'shape:original',
        typeName: 'shape',
        type: 'image',
        parentId: 'page:demo',
        index: 'a2',
        x: 700,
        y: 120,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          w: 320,
          h: 200,
          assetId: 'asset:original',
          playing: true,
          url: '',
          crop: null,
          flipX: false,
          flipY: false,
          altText: 'Original README demo image',
        },
      },
      'shape:annotation-arrow': {
        id: 'shape:annotation-arrow',
        typeName: 'shape',
        type: 'arrow',
        parentId: 'page:demo',
        index: 'a3',
        x: 1040,
        y: 80,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {
          cowartAnnotationArrow: true,
        },
        props: {
          kind: 'arc',
          dash: 'draw',
          size: 'm',
          fill: 'none',
          color: 'red',
          labelColor: 'red',
          bend: 24,
          elbowMidPoint: 0.5,
          start: { x: 0, y: 0 },
          end: { x: -110, y: 95 },
          arrowheadStart: 'none',
          arrowheadEnd: 'arrow',
          richText: richText('Make the product label brighter'),
          labelPosition: 0,
          font: 'draw',
          scale: 1,
        },
      },
    },
  }
}

async function seedReadmeDemoCanvas({ cowartUrl, projectDir }) {
  const originalPath = join(projectDir, 'canvas', 'pages', 'demo', 'assets', 'original.png')
  await writePng(originalPath)

  const snapshot = baseSnapshot()
  const canvasResult = await putJson(`${cowartUrl}/api/canvas`, snapshot)
  assert.equal(canvasResult.ok, true)
  assert.equal(canvasResult.storage, 'per-page')

  const viewState = {
    version: 1,
    currentPageId: 'page:demo',
    camera: { x: 0, y: 0, z: 1 },
    updatedAt: nowIso(),
  }
  await putJson(`${cowartUrl}/api/view-state`, viewState)

  const selection = {
    selectedShapes: [snapshot.store['shape:holder']],
    selectedImageRegion: null,
    updatedAt: nowIso(),
  }
  await putJson(`${cowartUrl}/api/selection`, selection)

  return snapshot
}

async function runOpenCanvasDemo({ cowartUrl, projectDir }) {
  const html = await fetch(`${cowartUrl}/`).then((response) => response.text())
  assert.match(html, /<html/i)

  const canvas = await fetchJson(`${cowartUrl}/api/canvas`)
  assert.equal(canvas.storage, 'per-page')
  assert.ok(canvas.snapshot.store['page:demo'])

  const pageFile = join(projectDir, 'canvas', 'pages', 'demo', 'cowart-canvas.json')
  await stat(pageFile)

  return {
    skill: 'cowart-open-canvas',
    prompt: demoPrompts['cowart-open-canvas'],
    passed: true,
    evidence: { url: cowartUrl, pageFile },
  }
}

async function runImageGenDemo({ cowartUrl, projectDir, workDir }) {
  const layoutPath = join(workDir, 'holder-layout.json')
  const imageMapPath = join(workDir, 'holder-image-map.json')
  await writeFile(
    layoutPath,
    `${JSON.stringify(
      {
        source: {
          kind: 'generation-layout',
          description: 'README holder generation demo fixture.',
        },
        regions: [
          {
            id: 'headline',
            type: 'text',
            label: 'Headline',
            text: 'Launch Plan',
            bbox: { x: 0.1, y: 0.08, w: 0.8, h: 0.16 },
            confidence: 0.9,
          },
          {
            id: 'main-visual',
            type: 'module',
            label: 'Main visual',
            bbox: { x: 0.18, y: 0.32, w: 0.64, h: 0.5 },
            confidence: 0.85,
          },
        ],
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  await execFileAsync(process.execPath, [
    join(repoRoot, 'scripts', 'cowart-image-map.mjs'),
    'from-layout',
    '--layout',
    layoutPath,
    '--out',
    imageMapPath,
  ])
  const imageMap = JSON.parse(await readFile(imageMapPath, 'utf8'))

  const imagePath = await writePng(join(workDir, 'generated-holder.png'))
  const result = await insertCowartImage({
    imagePath,
    projectDir,
    cowartUrl,
    anchorShapeId: 'shape:holder',
    placement: 'inside',
    matchAnchor: true,
    fileName: 'generated-holder.png',
    imageMap,
    shapeMeta: {
      cowartGeneratedForAiImageHolder: 'shape:holder',
    },
    altText: 'Generated image inserted into Cowart AI image holder',
  })

  assert.equal(result.parentId, 'shape:holder')
  assert.deepEqual(result.bounds, { x: 0, y: 0, w: 512, h: 683 })
  assert.equal(result.imageMapRegionCount, 2)

  const canvas = await fetchJson(`${cowartUrl}/api/canvas`)
  const insertedShape = canvas.snapshot.store[result.shapeId]
  const insertedAsset = canvas.snapshot.store[result.assetId]
  assert.equal(insertedShape.parentId, 'shape:holder')
  assert.equal(insertedShape.meta.cowartGeneratedForAiImageHolder, 'shape:holder')
  assert.equal(insertedShape.meta.cowartImageMap.regions.length, 2)
  assert.equal(insertedAsset.meta.cowartImageMap.regions[0].id, 'headline')
  await stat(result.assetFile)

  return {
    skill: 'cowart-image-gen',
    prompt: demoPrompts['cowart-image-gen'],
    passed: true,
    evidence: {
      shapeId: result.shapeId,
      assetId: result.assetId,
      parentId: result.parentId,
      bounds: result.bounds,
      imageMapRegionCount: result.imageMapRegionCount,
      assetFile: result.assetFile,
    },
  }
}

async function runImageEditDemo({ cowartUrl, projectDir, workDir }) {
  const before = await fetchJson(`${cowartUrl}/api/canvas`)
  const originalBefore = JSON.stringify(before.snapshot.store['shape:original'])
  const annotationBefore = JSON.stringify(before.snapshot.store['shape:annotation-arrow'])
  const imagePath = await writePng(join(workDir, 'annotation-edit-20260623-120000.png'))

  const result = await insertCowartImage({
    imagePath,
    projectDir,
    cowartUrl,
    anchorShapeId: 'shape:original',
    placement: 'right',
    margin: 40,
    matchAnchor: true,
    fileName: 'annotation-edit-20260623-120000.png',
    annotationScreenshot: 'annotation-demo.png',
    shapeMeta: {
      cowartGeneratedFromAnnotationEdit: true,
    },
    altText: 'Revised image generated from Cowart annotation screenshot',
  })

  const after = await fetchJson(`${cowartUrl}/api/canvas`)
  assert.equal(JSON.stringify(after.snapshot.store['shape:original']), originalBefore)
  assert.equal(JSON.stringify(after.snapshot.store['shape:annotation-arrow']), annotationBefore)

  const revisedShape = after.snapshot.store[result.shapeId]
  assert.equal(revisedShape.parentId, 'page:demo')
  assert.equal(revisedShape.props.w, 320)
  assert.equal(revisedShape.props.h, 200)
  assert.equal(revisedShape.meta.cowartGeneratedFromAnnotationEdit, true)
  assert.equal(revisedShape.meta.cowartAnnotationSourceShapeId, 'shape:original')
  assert.equal(revisedShape.meta.cowartAnnotationScreenshot, 'annotation-demo.png')
  assert.ok(revisedShape.x >= 700 + 320 + 40)
  await stat(result.assetFile)

  return {
    skill: 'cowart-image-edit',
    prompt: demoPrompts['cowart-image-edit'],
    passed: true,
    evidence: {
      shapeId: result.shapeId,
      assetId: result.assetId,
      bounds: result.bounds,
      sourceUnchanged: true,
      annotationUnchanged: true,
      assetFile: result.assetFile,
    },
  }
}

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), 'cowart-skills-e2e-'))
  const projectDir = join(workDir, 'project')
  const canvasDir = join(projectDir, 'canvas')
  await mkdir(projectDir, { recursive: true })

  await assertReadmeDemoPrompts()
  const coveredSkills = await discoverSkillNames()
  assert.deepEqual(coveredSkills, Object.keys(demoPrompts).sort())

  const server = await startCowartServer(projectDir, canvasDir)
  const results = []
  try {
    await seedReadmeDemoCanvas({ cowartUrl: server.cowartUrl, projectDir })
    results.push(await runOpenCanvasDemo({ cowartUrl: server.cowartUrl, projectDir }))
    results.push(await runImageGenDemo({ cowartUrl: server.cowartUrl, projectDir, workDir }))
    results.push(await runImageEditDemo({ cowartUrl: server.cowartUrl, projectDir, workDir }))

    const report = {
      passed: true,
      generatedAt: nowIso(),
      cowartUrl: server.cowartUrl,
      projectDir,
      workDir,
      coveredSkills,
      results,
      note: 'Image model output is represented by deterministic fixture PNGs; this E2E verifies the Cowart skill side effects from the README demos.',
    }
    const reportPath = join(workDir, 'e2e-skills-report.json')
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({ ...report, reportPath, computerUseSetup }, null, 2)}\n`)

    if (computerUseSetup) {
      process.stdout.write(`COMPUTER_USE_READY ${JSON.stringify({ cowartUrl: server.cowartUrl, projectDir, workDir, reportPath })}\n`)
      await new Promise((resolveShutdown) => {
        const shutdown = () => resolveShutdown()
        process.once('SIGINT', shutdown)
        process.once('SIGTERM', shutdown)
      })
    }
  } finally {
    await server.stop()
    if (cleanupArtifacts) {
      await rm(workDir, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  process.stderr.write(`Cowart skills E2E failed: ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
