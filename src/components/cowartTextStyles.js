export const COWART_TEXT_FONT_OPTIONS = [
  {
    value: 'draw',
    label: '手绘',
    fontFamily: 'var(--tl-font-draw)',
    baseFont: 'draw'
  },
  {
    value: 'sans',
    label: '无衬线',
    fontFamily: 'var(--tl-font-sans)',
    baseFont: 'sans'
  },
  {
    value: 'serif',
    label: '衬线',
    fontFamily: 'var(--tl-font-serif)',
    baseFont: 'serif'
  },
  {
    value: 'mono',
    label: '等宽',
    fontFamily: 'var(--tl-font-mono)',
    baseFont: 'mono'
  },
  {
    value: 'yahei',
    label: '微软雅黑',
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
    baseFont: 'sans'
  },
  {
    value: 'pingfang',
    label: '苹方',
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    baseFont: 'sans'
  },
  {
    value: 'heiti',
    label: '黑体',
    fontFamily: '"SimHei", "Microsoft YaHei", sans-serif',
    baseFont: 'sans'
  },
  {
    value: 'songti',
    label: '宋体',
    fontFamily: '"SimSun", "Songti SC", "STSong", serif',
    baseFont: 'serif'
  },
]

const TEXT_FONT_SIZE_MAP = {
  s: 18,
  m: 24,
  l: 36,
  xl: 44
}

const NOTE_FONT_SIZE_MAP = {
  s: 18,
  m: 22,
  l: 26,
  xl: 32
}

export function getCowartFontOption(value) {
  return COWART_TEXT_FONT_OPTIONS.find((option) => option.value === value) ?? COWART_TEXT_FONT_OPTIONS[0]
}

export function getCowartFontFamily(value, fallback = 'sans') {
  return getCowartFontOption(value ?? fallback).fontFamily
}

export function getCowartBaseFont(value, fallback = 'sans') {
  return getCowartFontOption(value ?? fallback).baseFont
}

export function getCowartDefaultFontSize(shape) {
  const size = shape?.props?.size
  const map = shape?.type === 'note' ? NOTE_FONT_SIZE_MAP : TEXT_FONT_SIZE_MAP
  return map[size] ?? map.m
}

export function getCowartFontSize(shape) {
  const raw = Number(shape?.meta?.cowartTextFontSize)
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.max(Math.round(raw), 8), 240)
  }

  return getCowartDefaultFontSize(shape)
}

export function getCowartFontKey(shape) {
  const metaValue = shape?.meta?.cowartTextFontFamily
  if (typeof metaValue === 'string') {
    return getCowartFontOption(metaValue).value
  }

  return getCowartFontOption(shape?.props?.font ?? 'sans').value
}

export function getCowartNearestSizeStyle(shapeType, fontSize) {
  const map = shapeType === 'note' ? NOTE_FONT_SIZE_MAP : TEXT_FONT_SIZE_MAP
  const entries = Object.entries(map)
  let nearest = entries[0]?.[0] ?? 'm'
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const [size, value] of entries) {
    const distance = Math.abs(Number(fontSize) - value)
    if (distance < nearestDistance) {
      nearest = size
      nearestDistance = distance
    }
  }

  return nearest
}
