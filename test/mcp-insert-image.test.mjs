import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import test from 'node:test'

import { insertCowartImage } from '../mcp/server.mjs'

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
)

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()))
  })
}

test('insertCowartImage stores normalized image map metadata on asset and shape records', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cowart-mcp-test-'))
  const projectDir = join(tempDir, 'project')
  await mkdir(projectDir, { recursive: true })
  const imagePath = join(tempDir, 'fixture.png')
  await writeFile(imagePath, ONE_BY_ONE_PNG)

  let savedSnapshot = null
  const snapshot = {
    schema: { schemaVersion: 2 },
    store: {
      'page:test': {
        id: 'page:test',
        typeName: 'page',
        name: 'Test',
        index: 'a1',
        meta: {},
      },
    },
  }

  const server = createServer(async (request, response) => {
    if (request.url === '/api/canvas' && request.method === 'GET') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ snapshot }))
      return
    }

    if (request.url === '/api/canvas' && request.method === 'PUT') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      savedSnapshot = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ ok: true }))
      return
    }

    response.statusCode = 404
    response.end()
  })

  try {
    const address = await listen(server)
    const result = await insertCowartImage({
      imagePath,
      projectDir,
      cowartUrl: `http://${address.address}:${address.port}`,
      pageId: 'page:test',
      fileName: 'fixture.png',
      imageMap: {
        version: 1,
        regions: [
          {
            id: 'title',
            type: 'text',
            label: 'Title',
            text: 'Hello',
            bbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.2 },
          },
        ],
      },
    })

    assert.equal(result.imageMapRegionCount, 1)
    assert.equal(result.imageMap.regions[0].bbox.unit, 'relative')
    assert.ok(savedSnapshot, 'expected insertCowartImage to save the updated snapshot')
    assert.equal(savedSnapshot.store[result.assetId].meta.cowartImageMap.regions[0].id, 'title')
    assert.equal(savedSnapshot.store[result.shapeId].meta.cowartImageMap.regions[0].text, 'Hello')

    const copiedImage = await readFile(result.assetFile)
    assert.equal(copiedImage.length, ONE_BY_ONE_PNG.length)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('insertCowartImage can fill a frame holder by inserting inside it', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'cowart-mcp-test-'))
  const projectDir = join(tempDir, 'project')
  await mkdir(projectDir, { recursive: true })
  const imagePath = join(tempDir, 'fixture.png')
  await writeFile(imagePath, ONE_BY_ONE_PNG)

  let savedSnapshot = null
  const snapshot = {
    schema: { schemaVersion: 2 },
    store: {
      'page:test': {
        id: 'page:test',
        typeName: 'page',
        name: 'Test',
        index: 'a1',
        meta: {},
      },
      'shape:holder': {
        id: 'shape:holder',
        typeName: 'shape',
        type: 'frame',
        parentId: 'page:test',
        index: 'a1',
        x: 120,
        y: 160,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: { cowartAiImageHolder: true },
        props: { w: 512, h: 683, name: 'AI 图片', color: 'blue' },
      },
    },
  }

  const server = createServer(async (request, response) => {
    if (request.url === '/api/canvas' && request.method === 'GET') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ snapshot }))
      return
    }

    if (request.url === '/api/canvas' && request.method === 'PUT') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      savedSnapshot = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ ok: true }))
      return
    }

    response.statusCode = 404
    response.end()
  })

  try {
    const address = await listen(server)
    const result = await insertCowartImage({
      imagePath,
      projectDir,
      cowartUrl: `http://${address.address}:${address.port}`,
      anchorShapeId: 'shape:holder',
      placement: 'inside',
      matchAnchor: true,
      fileName: 'holder-fill.png',
      shapeMeta: { cowartGeneratedForAiImageHolder: 'shape:holder' },
    })

    assert.equal(result.parentId, 'shape:holder')
    assert.deepEqual(result.bounds, { x: 0, y: 0, w: 512, h: 683 })
    const insertedShape = savedSnapshot.store[result.shapeId]
    assert.equal(insertedShape.parentId, 'shape:holder')
    assert.equal(insertedShape.x, 0)
    assert.equal(insertedShape.y, 0)
    assert.equal(insertedShape.props.w, 512)
    assert.equal(insertedShape.props.h, 683)
    assert.equal(insertedShape.meta.cowartGeneratedForAiImageHolder, 'shape:holder')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
