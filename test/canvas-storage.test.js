import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createServer } from 'vite'
import { createTLStore, PageRecordType } from 'tldraw'

const rootDir = dirname(fileURLToPath(new URL('../vite.config.js', import.meta.url)))

function page(id, name, index) {
  return PageRecordType.create({
    id: PageRecordType.createId(id),
    name,
    index
  })
}

function snapshotWithPages(...pages) {
  return {
    schema: createTLStore().schema.serialize(),
    store: Object.fromEntries(pages.map((record) => [record.id, record]))
  }
}

function pageFilePath(canvasDir, pageId) {
  const pageDirName = encodeURIComponent(pageId.replace('page:', ''))
  return join(canvasDir, 'pages', pageDirName, 'cowart-canvas.json')
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function putCanvas(baseUrl, snapshot) {
  const response = await fetch(`${baseUrl}/api/canvas`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(snapshot)
  })
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  return body
}

test('removes page files that are not in the latest canvas snapshot', async () => {
  const canvasDir = await mkdtemp(join(tmpdir(), 'cowart-canvas-'))
  process.env.COWART_CANVAS_DIR = canvasDir

  const server = await createServer({
    configFile: join(rootDir, 'vite.config.js'),
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0
    }
  })

  await server.listen()

  try {
    const { port } = server.httpServer.address()
    const baseUrl = `http://127.0.0.1:${port}`
    const firstPage = page('first', 'First', 'a1')
    const deletedPage = page('deleted', 'Deleted', 'a2')

    await putCanvas(baseUrl, snapshotWithPages(firstPage, deletedPage))
    assert.equal(await pathExists(pageFilePath(canvasDir, deletedPage.id)), true)

    await putCanvas(baseUrl, snapshotWithPages(firstPage))

    assert.equal(
      await pathExists(pageFilePath(canvasDir, deletedPage.id)),
      false,
      'stale per-page snapshot should be removed'
    )

    const response = await fetch(`${baseUrl}/api/canvas`)
    const body = await response.json()
    assert.equal(response.status, 200, JSON.stringify(body))
    assert.deepEqual(
      Object.keys(body.snapshot.store).sort(),
      [firstPage.id],
      'stale page records should not be merged into the loaded snapshot'
    )
  } finally {
    server.httpServer.closeAllConnections?.()
    await server.close()
    delete process.env.COWART_CANVAS_DIR
    await rm(canvasDir, { recursive: true, force: true })
  }
})
