import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const cliPath = new URL('../scripts/cowart-image-map.mjs', import.meta.url)

async function writeFixtureJson(dir, fileName, data) {
  const filePath = join(dir, fileName)
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return filePath
}

test('cowart-image-map from-layout normalizes a generation layout contract', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cowart-image-map-cli-'))
  const layoutPath = await writeFixtureJson(dir, 'layout.json', {
    source: { kind: 'generation-layout', promptId: 'fixture' },
    regions: [
      {
        id: 'headline',
        type: 'text',
        label: 'Headline',
        text: 'Quarterly Launch',
        bbox: { x: '0.1', y: 0.15, w: 0.5, h: 0.12 },
        confidence: 0.9,
      },
    ],
  })
  const outPath = join(dir, 'image-map.json')

  await execFileAsync(process.execPath, [cliPath.pathname, 'from-layout', '--layout', layoutPath, '--out', outPath])

  const imageMap = JSON.parse(await readFile(outPath, 'utf8'))
  assert.equal(imageMap.version, 1)
  assert.equal(imageMap.source.promptId, 'fixture')
  assert.equal(imageMap.regions[0].bbox.unit, 'relative')
  assert.equal(imageMap.regions[0].text, 'Quarterly Launch')
})

test('cowart-image-map validate accepts wrapper objects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cowart-image-map-cli-'))
  const inputPath = await writeFixtureJson(dir, 'wrapped.json', {
    cowartImageMap: {
      version: 1,
      regions: [
        {
          id: 'hero',
          type: 'module',
          label: 'Hero',
          bbox: { x: 0, y: 0, w: 1, h: 0.5, unit: 'relative' },
        },
      ],
    },
  })

  const { stdout } = await execFileAsync(process.execPath, [cliPath.pathname, 'validate', '--input', inputPath])
  const imageMap = JSON.parse(stdout)
  assert.equal(imageMap.regions[0].id, 'hero')
})

test('cowart-image-map rejects malformed layout bboxes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cowart-image-map-cli-'))
  const layoutPath = await writeFixtureJson(dir, 'bad-layout.json', {
    regions: [
      {
        id: 'bad',
        type: 'area',
        label: 'Bad',
        bbox: { x: 0.8, y: 0.2, w: 0.3, h: 0.2 },
      },
    ],
  })

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath.pathname, 'from-layout', '--layout', layoutPath]),
    /inside the normalized 0\.\.1 image area/
  )
})
