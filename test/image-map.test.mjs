import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findCowartImageMapRegion,
  getCowartImageMapFromRecords,
  normalizeImageMap,
  tryNormalizeImageMap,
} from '../src/imageMap.js'

test('normalizes a generated image map', () => {
  const imageMap = normalizeImageMap({
    version: 1,
    source: { kind: 'generated-layout' },
    regions: [
      {
        id: 'hero',
        type: 'module',
        label: 'Hero module',
        bbox: { x: 0.1, y: 0.2, w: 0.7, h: 0.3, unit: 'relative' },
        confidence: 0.92,
      },
      {
        id: 'headline',
        type: 'text',
        label: 'Headline',
        text: 'Launch faster',
        bbox: { x: 0.18, y: 0.25, w: 0.34, h: 0.1 },
      },
    ],
  })

  assert.equal(imageMap.version, 1)
  assert.equal(imageMap.regions.length, 2)
  assert.deepEqual(imageMap.regions[1].bbox, {
    x: 0.18,
    y: 0.25,
    w: 0.34,
    h: 0.1,
    unit: 'relative',
  })
})

test('rejects malformed relative bbox values', () => {
  assert.throws(
    () =>
      normalizeImageMap({
        version: 1,
        regions: [
          {
            id: 'bad',
            type: 'area',
            label: 'Bad region',
            bbox: { x: 0.8, y: 0.2, w: 0.4, h: 0.3, unit: 'relative' },
          },
        ],
      }),
    /inside the normalized 0\.\.1 image area/
  )
})

test('rejects duplicate region ids', () => {
  assert.throws(
    () =>
      normalizeImageMap({
        version: 1,
        regions: [
          { id: 'same', type: 'module', label: 'A', bbox: { x: 0, y: 0, w: 0.2, h: 0.2 } },
          { id: 'same', type: 'area', label: 'B', bbox: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 } },
        ],
      }),
    /duplicated/
  )
})

test('reads image map from shape metadata before asset metadata', () => {
  const assetMap = {
    version: 1,
    regions: [{ id: 'asset-region', label: 'Asset', bbox: { x: 0, y: 0, w: 0.5, h: 0.5 } }],
  }
  const shapeMap = {
    version: 1,
    regions: [{ id: 'shape-region', label: 'Shape', bbox: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }],
  }

  const imageMap = getCowartImageMapFromRecords(
    { meta: { cowartImageMap: shapeMap } },
    { meta: { cowartImageMap: assetMap } }
  )

  assert.equal(findCowartImageMapRegion(imageMap, 'shape-region')?.label, 'Shape')
  assert.equal(findCowartImageMapRegion(imageMap, 'asset-region'), null)
})

test('tryNormalizeImageMap returns null for invalid maps', () => {
  assert.equal(tryNormalizeImageMap({ version: 2, regions: [] }), null)
})
