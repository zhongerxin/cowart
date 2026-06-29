export const COWART_IMAGE_MAP_META_KEY = 'cowartImageMap'
export const COWART_IMAGE_MAP_VERSION = 1
export const COWART_IMAGE_REGION_TYPES = new Set(['module', 'area', 'text'])

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeSource(source) {
  if (source == null) return undefined
  if (typeof source === 'string') return source
  if (typeof source === 'object') return { ...source }
  return undefined
}

function normalizeConfidence(confidence) {
  if (confidence == null) return undefined
  if (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1) {
    throw new TypeError('Image map region confidence must be a number from 0 to 1.')
  }
  return confidence
}

export function normalizeImageMapBBox(bbox) {
  if (!bbox || typeof bbox !== 'object') {
    throw new TypeError('Image map region bbox is required.')
  }

  const unit = bbox.unit ?? 'relative'
  if (unit !== 'relative') {
    throw new TypeError('Image map region bbox unit must be "relative".')
  }

  const x = Number(bbox.x)
  const y = Number(bbox.y)
  const w = Number(bbox.w)
  const h = Number(bbox.h)

  if (![x, y, w, h].every(isFiniteNumber)) {
    throw new TypeError('Image map region bbox must contain finite x, y, w, and h values.')
  }
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 || y + h > 1) {
    throw new TypeError('Image map region bbox must be inside the normalized 0..1 image area.')
  }

  return { x, y, w, h, unit }
}

export function normalizeImageMapRegion(region, index = 0) {
  if (!region || typeof region !== 'object') {
    throw new TypeError('Image map region must be an object.')
  }

  const id = nonEmptyString(region.id) ?? `region-${index + 1}`
  const type = nonEmptyString(region.type) ?? 'area'
  if (!COWART_IMAGE_REGION_TYPES.has(type)) {
    throw new TypeError(`Image map region type must be one of: ${[...COWART_IMAGE_REGION_TYPES].join(', ')}.`)
  }

  const label = nonEmptyString(region.label) ?? id
  const normalizedRegion = {
    id,
    type,
    label,
    bbox: normalizeImageMapBBox(region.bbox),
  }

  const text = nonEmptyString(region.text)
  if (text) normalizedRegion.text = text

  const confidence = normalizeConfidence(region.confidence)
  if (confidence !== undefined) normalizedRegion.confidence = confidence

  const source = normalizeSource(region.source)
  if (source !== undefined) normalizedRegion.source = source

  return normalizedRegion
}

export function normalizeImageMap(imageMap) {
  if (imageMap == null) return null
  if (!imageMap || typeof imageMap !== 'object' || Array.isArray(imageMap)) {
    throw new TypeError('Image map must be an object.')
  }

  const version = imageMap.version ?? COWART_IMAGE_MAP_VERSION
  if (version !== COWART_IMAGE_MAP_VERSION) {
    throw new TypeError(`Image map version must be ${COWART_IMAGE_MAP_VERSION}.`)
  }
  if (!Array.isArray(imageMap.regions)) {
    throw new TypeError('Image map must include a regions array.')
  }

  const seenIds = new Set()
  const regions = imageMap.regions.map((region, index) => {
    const normalizedRegion = normalizeImageMapRegion(region, index)
    if (seenIds.has(normalizedRegion.id)) {
      throw new TypeError(`Image map region id is duplicated: ${normalizedRegion.id}.`)
    }
    seenIds.add(normalizedRegion.id)
    return normalizedRegion
  })

  const normalizedMap = {
    version: COWART_IMAGE_MAP_VERSION,
    regions,
  }

  const source = normalizeSource(imageMap.source)
  if (source !== undefined) normalizedMap.source = source

  const generatedAt = nonEmptyString(imageMap.generatedAt)
  if (generatedAt) normalizedMap.generatedAt = generatedAt

  return normalizedMap
}

export function tryNormalizeImageMap(imageMap) {
  try {
    return normalizeImageMap(imageMap)
  } catch {
    return null
  }
}

export function getCowartImageMapFromRecords(shape, asset) {
  return tryNormalizeImageMap(
    shape?.meta?.[COWART_IMAGE_MAP_META_KEY] ?? asset?.meta?.[COWART_IMAGE_MAP_META_KEY]
  )
}

export function findCowartImageMapRegion(imageMap, regionId) {
  const id = nonEmptyString(regionId)
  if (!id) return null
  return imageMap?.regions?.find((region) => region.id === id) ?? null
}
