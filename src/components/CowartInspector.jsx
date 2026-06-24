import { useEffect, useState } from 'react'

const SHAPE_COLOR_OPTIONS = [
  { value: 'black', label: '黑色', swatch: '#1f2430' },
  { value: 'grey', label: '灰色', swatch: '#697386' },
  { value: 'light-violet', label: '浅紫', swatch: '#b8a3ff' },
  { value: 'violet', label: '紫色', swatch: '#7c3aed' },
  { value: 'blue', label: '蓝色', swatch: '#3e63dd' },
  { value: 'light-blue', label: '浅蓝', swatch: '#8ec5ff' },
  { value: 'yellow', label: '黄色', swatch: '#f5d90a' },
  { value: 'orange', label: '橙色', swatch: '#f76b15' },
  { value: 'green', label: '绿色', swatch: '#30a46c' },
  { value: 'light-green', label: '浅绿', swatch: '#8fd19e' },
  { value: 'light-red', label: '浅红', swatch: '#f39aa0' },
  { value: 'red', label: '红色', swatch: '#e5484d' },
  { value: 'white', label: '白色', swatch: '#ffffff' }
]

const FILL_OPTIONS = [
  { value: 'none', label: '无填充' },
  { value: 'semi', label: '半透明' },
  { value: 'solid', label: '纯色' },
  { value: 'pattern', label: '纹理' },
  { value: 'fill', label: '填满' },
  { value: 'lined-fill', label: '线性填充' }
]

const DASH_OPTIONS = [
  { value: 'draw', label: '手绘' },
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
  { value: 'none', label: '无描边' }
]

const SIZE_OPTIONS = [
  { value: 's', label: '细' },
  { value: 'm', label: '中' },
  { value: 'l', label: '粗' },
  { value: 'xl', label: '特粗' }
]

const FONT_OPTIONS = [
  { value: 'draw', label: '手绘' },
  { value: 'sans', label: '无衬线' },
  { value: 'serif', label: '衬线' },
  { value: 'mono', label: '等宽' }
]

const ALIGN_OPTIONS = [
  { value: 'start', label: '左对齐' },
  { value: 'middle', label: '居中' },
  { value: 'end', label: '右对齐' }
]

const VERTICAL_ALIGN_OPTIONS = [
  { value: 'start', label: '顶部' },
  { value: 'middle', label: '居中' },
  { value: 'end', label: '底部' }
]

const HORIZONTAL_ALIGN_BUTTONS = [
  { value: 'start', label: '左' },
  { value: 'middle', label: '中' },
  { value: 'end', label: '右' }
]

const TEXT_ALIGN_BUTTONS = [
  { value: 'start', label: '左' },
  { value: 'middle', label: '中' },
  { value: 'end', label: '右' }
]

const VERTICAL_ALIGN_BUTTONS = [
  { value: 'start', label: '上' },
  { value: 'middle', label: '中' },
  { value: 'end', label: '下' }
]

const EXPORT_PRESET_OPTIONS = [
  {
    value: 'selection-png',
    label: '选区 PNG',
    format: 'png',
    scale: 2,
    background: false,
    scope: 'selection'
  },
  {
    value: 'selection-svg',
    label: '选区 SVG',
    format: 'svg',
    scale: 1,
    background: false,
    scope: 'selection'
  },
  {
    value: 'page-png',
    label: '整页 PNG',
    format: 'png',
    scale: 2,
    background: true,
    scope: 'page'
  }
]

const EXPORT_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' }
]

const EXPORT_SCALE_OPTIONS = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' }
]

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/^#/, '')

  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    return `#${normalized
      .split('')
      .map((char) => char + char)
      .join('')
      .toLowerCase()}`
  }

  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `#${normalized.toLowerCase()}`
  }

  return null
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value)
  if (!normalized) return null

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  }
}

function resolveColorOptionValue(value, options = SHAPE_COLOR_OPTIONS) {
  if (typeof value !== 'string' || value.length === 0) return null

  const matchedOption = options.find((option) => option.value === value)
  if (matchedOption) return matchedOption.value

  const targetColor = hexToRgb(value)
  if (!targetColor) return null

  let closestOption = options[0] ?? null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const option of options) {
    const optionColor = hexToRgb(option.swatch)
    if (!optionColor) continue

    const distance =
      (targetColor.r - optionColor.r) ** 2 +
      (targetColor.g - optionColor.g) ** 2 +
      (targetColor.b - optionColor.b) ** 2

    if (distance < closestDistance) {
      closestOption = option
      closestDistance = distance
    }
  }

  return closestOption?.value ?? null
}

function resolveColorSwatch(value, options = SHAPE_COLOR_OPTIONS) {
  const resolvedValue = resolveColorOptionValue(value, options)
  const matchedOption = options.find((option) => option.value === resolvedValue)
  return matchedOption?.swatch ?? options[0]?.swatch ?? '#1f2430'
}

function getColorDisplayValue(value, options = SHAPE_COLOR_OPTIONS) {
  if (typeof value !== 'string' || value.length === 0) return ''
  return normalizeHexColor(value) ?? options.find((option) => option.value === value)?.swatch ?? value
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), min), max)
}

function parseFiniteInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}

function parseFiniteNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function toDegrees(rotation) {
  return Math.round((parseFiniteNumber(rotation, 0) * 180) / Math.PI)
}

function toRadians(degrees) {
  return (parseFiniteNumber(degrees, 0) * Math.PI) / 180
}

function getSaveStateLabel(saveState) {
  if (saveState === 'saving') return '保存中'
  if (saveState === 'error') return '保存失败'
  return '已保存'
}

function getShapeTypeLabel(shape) {
  if (!shape) return ''
  return shape.type
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function getCurrentPageShapeIds(editor) {
  return editor.getSortedChildIdsForParent(editor.getCurrentPageId())
}

function getSelectionShapeIds(editor) {
  return editor.getSelectedShapeIds()
}

function getExportTargetShapeIds(editor, scope) {
  if (scope === 'page') return getCurrentPageShapeIds(editor)

  const selectedShapeIds = getSelectionShapeIds(editor)
  if (selectedShapeIds.length > 0) return selectedShapeIds
  return getCurrentPageShapeIds(editor)
}

function getExportTargetLabel(editor, scope = 'auto') {
  const selectedShapeIds = getSelectionShapeIds(editor)
  if (scope !== 'page' && selectedShapeIds.length > 0) {
    return selectedShapeIds.length === 1 ? '当前选中对象' : `当前选中 ${selectedShapeIds.length} 个对象`
  }

  return `当前页面 ${editor.getCurrentPage().name}`
}

function getSharedStringValue(shapes, getter) {
  if (shapes.length === 0) return null
  const firstValue = getter(shapes[0])
  if (typeof firstValue !== 'string') return null

  for (const shape of shapes.slice(1)) {
    if (getter(shape) !== firstValue) return null
  }

  return firstValue
}

function getRotationDegreesValue(shapes) {
  if (shapes.length === 0) return null
  const firstValue = toDegrees(shapes[0].rotation)

  for (const shape of shapes.slice(1)) {
    if (toDegrees(shape.rotation) !== firstValue) return null
  }

  return firstValue
}

function supportsPosition(shape) {
  return Number.isFinite(Number(shape?.x)) && Number.isFinite(Number(shape?.y))
}

function supportsSize(shape) {
  return Number.isFinite(Number(shape?.props?.w)) && Number.isFinite(Number(shape?.props?.h))
}

function supportsRotation(shape) {
  return Number.isFinite(Number(shape?.rotation))
}

function supportsOpacity(shape) {
  return Number.isFinite(Number(shape?.opacity ?? 1))
}

function supportsImageCornerRadius(shape) {
  return shape?.type === 'image' && Number.isFinite(Number(shape?.props?.w)) && Number.isFinite(Number(shape?.props?.h))
}

function supportsFill(shape) {
  return typeof shape?.props?.fill === 'string'
}

function supportsStrokeColor(shape) {
  return typeof shape?.props?.color === 'string'
}

function supportsStrokeDash(shape) {
  return typeof shape?.props?.dash === 'string'
}

function supportsStrokeSize(shape) {
  return typeof shape?.props?.size === 'string'
}

function supportsFont(shape) {
  return typeof shape?.props?.font === 'string'
}

function supportsHorizontalAlign(shape) {
  return typeof shape?.props?.align === 'string'
}

function supportsTextAlign(shape) {
  return typeof shape?.props?.textAlign === 'string'
}

function supportsVerticalAlign(shape) {
  return typeof shape?.props?.verticalAlign === 'string'
}

function supportsLabelColor(shape) {
  return typeof shape?.props?.labelColor === 'string'
}

function shouldShowTextStyleSection(shape) {
  return shape?.type === 'text' || shape?.type === 'note'
}

function getImageCornerRadiusValue(shape) {
  if (!supportsImageCornerRadius(shape)) return 0
  const width = Number(shape.props?.w) || 0
  const height = Number(shape.props?.h) || 0
  const maxRadius = Math.max(0, Math.floor(Math.min(width, height) / 2))
  const radius = Number(shape?.meta?.cowartImageCornerRadius ?? 0)
  if (!Number.isFinite(radius)) return 0
  return Math.min(Math.max(Math.round(radius), 0), maxRadius)
}

function getImageBorderWidthValue(shape) {
  if (!supportsImageCornerRadius(shape)) return 0
  const width = Number(shape?.meta?.cowartImageBorderWidth ?? 0)
  if (!Number.isFinite(width)) return 0
  return Math.min(Math.max(Math.round(width), 0), 24)
}

function getImageBorderColorValue(shape) {
  if (!supportsImageCornerRadius(shape)) return 'black'
  return resolveColorOptionValue(shape?.meta?.cowartImageBorderColor, SHAPE_COLOR_OPTIONS) ?? 'black'
}

function getImageShadowValue(shape) {
  if (!supportsImageCornerRadius(shape)) return 0
  const shadow = Number(shape?.meta?.cowartImageShadow ?? 0)
  if (!Number.isFinite(shadow)) return 0
  return Math.min(Math.max(Math.round(shadow), 0), 100)
}

function getImageBlurValue(shape) {
  if (!supportsImageCornerRadius(shape)) return 0
  const blur = Number(shape?.meta?.cowartImageBlur ?? 0)
  if (!Number.isFinite(blur)) return 0
  return Math.min(Math.max(Math.round(blur), 0), 40)
}

function getImageShadowColorValue(shape) {
  if (!supportsImageCornerRadius(shape)) return 'black'
  return resolveColorOptionValue(shape?.meta?.cowartImageShadowColor, SHAPE_COLOR_OPTIONS) ?? 'black'
}

function ColorControl({ label, value, onChange, options = SHAPE_COLOR_OPTIONS }) {
  const [draftValue, setDraftValue] = useState(() => getColorDisplayValue(value, options))
  const colorInputValue = resolveColorSwatch(value, options)

  useEffect(() => {
    setDraftValue(getColorDisplayValue(value, options))
  }, [options, value])

  function commitTextValue() {
    const nextValue = resolveColorOptionValue(draftValue, options)
    if (!nextValue) {
      setDraftValue(getColorDisplayValue(value, options))
      return
    }

    onChange(nextValue)
  }

  return (
    <fieldset className="cowart-color-field cowart-color-field-compact">
      <legend>{label}</legend>

      <div className="cowart-color-input-row">
        <input
          className="cowart-color-native-input"
          type="color"
          value={colorInputValue}
          aria-label={`${label}颜色选择`}
          onChange={(event) => {
            const nextValue = resolveColorOptionValue(event.target.value, options)
            if (!nextValue) return
            onChange(nextValue)
          }}
        />
        <input
          className="cowart-color-text-input"
          type="text"
          value={draftValue}
          placeholder="#000000"
          aria-label={`${label}颜色值`}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={commitTextValue}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            commitTextValue()
          }}
        />
      </div>
    </fieldset>
  )
}

function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className="cowart-segmented-control">
      <span>{label}</span>
      <div className="cowart-segmented-control-track" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            className="cowart-segmented-control-button"
            type="button"
            data-active={value === option.value ? 'true' : 'false'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectionSection({ editor, selectedShapes }) {
  const singleSelectedShape = selectedShapes.length === 1 ? selectedShapes[0] : null
  const multipleSelectedShapes = selectedShapes.length > 1 ? selectedShapes : []
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true)
  const canEditPosition = supportsPosition(singleSelectedShape)
  const canEditSize = supportsSize(singleSelectedShape)
  const canEditRotation = supportsRotation(singleSelectedShape)
  const selectedX = parseFiniteInteger(singleSelectedShape?.x, 0)
  const selectedY = parseFiniteInteger(singleSelectedShape?.y, 0)
  const selectedWidth = clampNumber(singleSelectedShape?.props?.w, 1, 100000, 0)
  const selectedHeight = clampNumber(singleSelectedShape?.props?.h, 1, 100000, 0)
  const selectedRotation = canEditRotation ? toDegrees(singleSelectedShape.rotation) : 0
  const selectedOpacityPercent = singleSelectedShape
    ? Math.round((Number(singleSelectedShape.opacity ?? 1) || 1) * 100)
    : 100
  const selectedImageCornerRadius = getImageCornerRadiusValue(singleSelectedShape)
  const selectedImageBorderWidth = getImageBorderWidthValue(singleSelectedShape)
  const selectedImageBorderColor = getImageBorderColorValue(singleSelectedShape)
  const selectedImageShadow = getImageShadowValue(singleSelectedShape)
  const selectedImageBlur = getImageBlurValue(singleSelectedShape)
  const selectedImageShadowColor = getImageShadowColorValue(singleSelectedShape)

  const sharedFill = getSharedStringValue(multipleSelectedShapes, (shape) => shape.props?.fill)
  const sharedStrokeColor = getSharedStringValue(multipleSelectedShapes, (shape) => shape.props?.color)
  const sharedStrokeDash = getSharedStringValue(multipleSelectedShapes, (shape) => shape.props?.dash)
  const sharedStrokeSize = getSharedStringValue(multipleSelectedShapes, (shape) => shape.props?.size)
  const sharedRotation = getRotationDegreesValue(multipleSelectedShapes)

  const canBatchFill = multipleSelectedShapes.length > 0 && multipleSelectedShapes.every(supportsFill)
  const canBatchStrokeColor =
    multipleSelectedShapes.length > 0 && multipleSelectedShapes.every(supportsStrokeColor)
  const canBatchStrokeDash =
    multipleSelectedShapes.length > 0 && multipleSelectedShapes.every(supportsStrokeDash)
  const canBatchStrokeSize =
    multipleSelectedShapes.length > 0 && multipleSelectedShapes.every(supportsStrokeSize)

  function updateSingleShape(update) {
    if (!editor || !singleSelectedShape) return
    editor.updateShapes([
      {
        id: singleSelectedShape.id,
        type: singleSelectedShape.type,
        ...update
      }
    ])
  }

  function updateMultipleShapes(updateFactory) {
    if (!editor || multipleSelectedShapes.length === 0) return
    editor.updateShapes(
      multipleSelectedShapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        ...updateFactory(shape)
      }))
    )
  }

  function updateSingleShapePosition(partialPosition) {
    updateSingleShape({
      x: parseFiniteInteger(partialPosition.x ?? singleSelectedShape.x, selectedX),
      y: parseFiniteInteger(partialPosition.y ?? singleSelectedShape.y, selectedY)
    })
  }

  function updateSingleShapeOpacity(value) {
    updateSingleShape({
      opacity: clampNumber(value, 0, 100, 100) / 100
    })
  }

  function updateSingleShapeSize(partialProps) {
    const currentWidth = selectedWidth || 1
    const currentHeight = selectedHeight || 1
    const ratio = currentHeight === 0 ? 1 : currentWidth / currentHeight
    let nextWidth = clampNumber(partialProps.w ?? singleSelectedShape.props?.w, 1, 100000, currentWidth)
    let nextHeight = clampNumber(partialProps.h ?? singleSelectedShape.props?.h, 1, 100000, currentHeight)

    if (isAspectRatioLocked && supportsSize(singleSelectedShape)) {
      if (partialProps.w !== undefined && partialProps.h === undefined) {
        nextHeight = clampNumber(nextWidth / (ratio || 1), 1, 100000, currentHeight)
      }

      if (partialProps.h !== undefined && partialProps.w === undefined) {
        nextWidth = clampNumber(nextHeight * (ratio || 1), 1, 100000, currentWidth)
      }
    }

    updateSingleShape({
      props: {
        ...singleSelectedShape.props,
        ...partialProps,
        w: nextWidth,
        h: nextHeight
      }
    })
  }

  function updateSingleShapeStyle(partialProps) {
    updateSingleShape({
      props: {
        ...singleSelectedShape.props,
        ...partialProps
      }
    })
  }

  function updateSingleShapeMeta(partialMeta) {
    updateSingleShape({
      meta: {
        ...(singleSelectedShape.meta ?? {}),
        ...partialMeta
      }
    })
  }

  function updateBatchStyle(partialProps) {
    updateMultipleShapes((shape) => ({
      props: {
        ...shape.props,
        ...partialProps
      }
    }))
  }

  function updateBatchRotation(value) {
    updateMultipleShapes(() => ({
      rotation: toRadians(value)
    }))
  }

  return (
    <section className="cowart-inspector-section" aria-label="选中对象">
      {singleSelectedShape ? (
        <>
          <div className="cowart-selection-meta">
            <span className="cowart-selection-chip">{getShapeTypeLabel(singleSelectedShape)}</span>
            <strong>当前对象</strong>
          </div>

          <section className="cowart-property-group cowart-property-group-geometry" aria-label="对象几何">
            <div className="cowart-property-group-header">
              <h4>变换</h4>
            </div>
            <div className="cowart-object-transform-grid">
              <label className="cowart-transform-field">
                <span>X</span>
                <input
                  type="number"
                  step="1"
                  value={canEditPosition ? selectedX : ''}
                  placeholder="--"
                  disabled={!canEditPosition}
                  onChange={(event) => updateSingleShapePosition({ x: event.target.value })}
                />
              </label>
              <label className="cowart-transform-field">
                <span>Y</span>
                <input
                  type="number"
                  step="1"
                  value={canEditPosition ? selectedY : ''}
                  placeholder="--"
                  disabled={!canEditPosition}
                  onChange={(event) => updateSingleShapePosition({ y: event.target.value })}
                />
              </label>

              <label className="cowart-transform-field">
                <span>W</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={canEditSize ? selectedWidth : ''}
                  placeholder="--"
                  disabled={!canEditSize}
                  onChange={(event) => updateSingleShapeSize({ w: event.target.value })}
                />
              </label>
              <label className="cowart-transform-field">
                <span>H</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={canEditSize ? selectedHeight : ''}
                  placeholder="--"
                  disabled={!canEditSize}
                  onChange={(event) => updateSingleShapeSize({ h: event.target.value })}
                />
              </label>

              <label className="cowart-transform-field">
                <span>R</span>
                <input
                  type="number"
                  step="1"
                  value={canEditRotation ? selectedRotation : ''}
                  placeholder="--"
                  disabled={!canEditRotation}
                  onChange={(event) =>
                    updateSingleShape({
                      rotation: toRadians(event.target.value)
                    })
                  }
                />
              </label>

              <button
                className="cowart-transform-icon-button"
                type="button"
                aria-pressed={canEditSize && isAspectRatioLocked ? 'true' : 'false'}
                title={canEditSize ? (isAspectRatioLocked ? '已锁定宽高比例' : '未锁定宽高比例') : '当前对象不支持宽高比例锁定'}
                disabled={!canEditSize}
                onClick={() => setIsAspectRatioLocked((value) => !value)}
              >
                {isAspectRatioLocked ? '🔒' : '🔓'}
              </button>

              {!canEditSize && (
                <p className="cowart-section-empty cowart-transform-note">这个对象暂时不支持直接编辑宽高。</p>
              )}
            </div>
          </section>

          <StyleSection
            title="样式"
            shape={singleSelectedShape}
            opacityPercent={selectedOpacityPercent}
            imageCornerRadius={selectedImageCornerRadius}
            imageBorderWidth={selectedImageBorderWidth}
            imageBorderColor={selectedImageBorderColor}
            imageShadow={selectedImageShadow}
            imageBlur={selectedImageBlur}
            imageShadowColor={selectedImageShadowColor}
            canEditOpacity={supportsOpacity(singleSelectedShape)}
            onChangeOpacity={updateSingleShapeOpacity}
            onChangeMeta={updateSingleShapeMeta}
            onChangeStyle={updateSingleShapeStyle}
          />

          <TextStyleSection shape={singleSelectedShape} onChangeStyle={updateSingleShapeStyle} />
        </>
      ) : multipleSelectedShapes.length > 1 ? (
        <>
          <p className="cowart-section-note">已选中 {multipleSelectedShapes.length} 个对象。</p>

          <section className="cowart-subsection">
            <div className="cowart-section-subtitle">批量几何与样式</div>

            <label className="cowart-setting-stack">
              <span>旋转</span>
              <input
                type="number"
                step="1"
                value={sharedRotation ?? ''}
                placeholder="混合值"
                onChange={(event) => updateBatchRotation(event.target.value)}
              />
            </label>

            {canBatchFill && (
              <label className="cowart-setting-stack">
                <span>填充</span>
                <select
                  value={sharedFill ?? ''}
                  onChange={(event) => updateBatchStyle({ fill: event.target.value })}
                >
                  <option value="">混合值</option>
                  {FILL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {canBatchStrokeDash && (
              <label className="cowart-setting-stack">
                <span>描边样式</span>
                <select
                  value={sharedStrokeDash ?? ''}
                  onChange={(event) => updateBatchStyle({ dash: event.target.value })}
                >
                  <option value="">混合值</option>
                  {DASH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {canBatchStrokeSize && (
              <label className="cowart-setting-stack">
                <span>描边粗细</span>
                <select
                  value={sharedStrokeSize ?? ''}
                  onChange={(event) => updateBatchStyle({ size: event.target.value })}
                >
                  <option value="">混合值</option>
                  {SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {canBatchStrokeColor && (
              <ColorControl
                label="描边颜色"
                value={sharedStrokeColor ?? ''}
                onChange={(color) => updateBatchStyle({ color })}
              />
            )}

            {!canBatchFill && !canBatchStrokeDash && !canBatchStrokeSize && !canBatchStrokeColor && (
              <p className="cowart-section-empty">当前多选对象没有可安全批量应用的共有样式字段。</p>
            )}
          </section>
        </>
      ) : (
        <p className="cowart-section-empty">
          选中单个图形后，可以调整位置、尺寸、旋转、样式和文本；多选时会出现批量样式和批量旋转。
        </p>
      )}
    </section>
  )
}

function StyleSection({
  title,
  shape,
  opacityPercent,
  imageCornerRadius,
  imageBorderWidth,
  imageBorderColor,
  imageShadow,
  imageBlur,
  imageShadowColor,
  canEditOpacity,
  onChangeOpacity,
  onChangeMeta,
  onChangeStyle
}) {
  const canEditFill = supportsFill(shape)
  const canEditStrokeColor = supportsStrokeColor(shape)
  const canEditStrokeDash = supportsStrokeDash(shape)
  const canEditStrokeSize = supportsStrokeSize(shape)
  const canEditImageCornerRadius = supportsImageCornerRadius(shape)
  const canRenderOpacityRow = canEditOpacity && !canEditFill
  const canRenderSection =
    canEditFill ||
    canEditStrokeDash ||
    canEditStrokeSize ||
    canEditStrokeColor ||
    canRenderOpacityRow ||
    canEditImageCornerRadius

  if (!canRenderSection) return null

  return (
    <section className="cowart-property-group cowart-property-group-styles">
      <div className="cowart-property-group-header">
        <h4>{title}</h4>
      </div>

      {canEditFill && (
        <div className="cowart-property-row cowart-property-row-compact">
          <span className="cowart-property-label">填充</span>

          {canEditStrokeColor && (
            <ColorControl label="颜色" value={shape.props.color} onChange={(color) => onChangeStyle({ color })} />
          )}

          <div className="cowart-inline-control-row">
            <label className="cowart-compact-select cowart-compact-select-surface">
              <span>样式</span>
              <select value={shape.props.fill} onChange={(event) => onChangeStyle({ fill: event.target.value })}>
                {FILL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {canEditOpacity ? (
              <label className="cowart-compact-select cowart-compact-select-surface">
                <span>不透明度</span>
                <div className="cowart-input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={opacityPercent}
                    onChange={(event) => onChangeOpacity(event.target.value)}
                  />
                  <em>%</em>
                </div>
              </label>
            ) : null}
          </div>
        </div>
      )}

      {canRenderOpacityRow && (
        <div className="cowart-property-row cowart-property-row-compact">
          <span className="cowart-property-label">外观</span>
          <div className="cowart-inline-control-row">
            <label className="cowart-compact-select cowart-compact-select-surface">
              <span>不透明度</span>
              <div className="cowart-input-with-suffix">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={opacityPercent}
                  onChange={(event) => onChangeOpacity(event.target.value)}
                />
                <em>%</em>
              </div>
            </label>

            {canEditImageCornerRadius ? (
              <label className="cowart-compact-select cowart-compact-select-surface">
                <span>圆角</span>
                <div className="cowart-input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, Math.floor(Math.min(shape.props.w, shape.props.h) / 2))}
                    step="1"
                    value={imageCornerRadius}
                    onChange={(event) =>
                      onChangeMeta({
                        cowartImageCornerRadius: clampNumber(
                          event.target.value,
                          0,
                          Math.max(0, Math.floor(Math.min(shape.props.w, shape.props.h) / 2)),
                          imageCornerRadius
                        )
                      })
                    }
                  />
                  <em>px</em>
                </div>
              </label>
            ) : null}
          </div>

          {canEditImageCornerRadius ? (
            <>
              <div className="cowart-inline-control-row">
                <label className="cowart-compact-select cowart-compact-select-surface">
                  <span>边框粗细</span>
                  <div className="cowart-input-with-suffix">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="1"
                      value={imageBorderWidth}
                      onChange={(event) =>
                        onChangeMeta({
                          cowartImageBorderWidth: clampNumber(event.target.value, 0, 24, imageBorderWidth)
                        })
                      }
                    />
                    <em>px</em>
                  </div>
                </label>

                <label className="cowart-compact-select cowart-compact-select-surface">
                  <span>阴影</span>
                  <div className="cowart-input-with-suffix">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={imageShadow}
                      onChange={(event) =>
                        onChangeMeta({
                          cowartImageShadow: clampNumber(event.target.value, 0, 100, imageShadow)
                        })
                      }
                    />
                    <em>%</em>
                  </div>
                </label>
              </div>

              <div className="cowart-inline-control-row">
                <label className="cowart-compact-select cowart-compact-select-surface">
                  <span>模糊</span>
                  <div className="cowart-input-with-suffix">
                    <input
                      type="number"
                      min="0"
                      max="40"
                      step="1"
                      value={imageBlur}
                      onChange={(event) =>
                        onChangeMeta({
                          cowartImageBlur: clampNumber(event.target.value, 0, 40, imageBlur)
                        })
                      }
                    />
                    <em>px</em>
                  </div>
                </label>

                <div />
              </div>

              <ColorControl
                label="边框颜色"
                value={imageBorderColor}
                onChange={(color) =>
                  onChangeMeta({
                    cowartImageBorderColor: color
                  })
                }
              />

              <ColorControl
                label="阴影颜色"
                value={imageShadowColor}
                onChange={(color) =>
                  onChangeMeta({
                    cowartImageShadowColor: color
                  })
                }
              />
            </>
          ) : null}
        </div>
      )}

      {(canEditStrokeDash || canEditStrokeSize || canEditStrokeColor) && (
        <div className="cowart-property-row cowart-property-row-compact">
          <span className="cowart-property-label">描边</span>

          <div className="cowart-inline-control-row">
            {canEditStrokeDash && (
              <label className="cowart-compact-select cowart-compact-select-surface">
                <span>样式</span>
                <select value={shape.props.dash} onChange={(event) => onChangeStyle({ dash: event.target.value })}>
                  {DASH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {canEditStrokeSize && (
              <label className="cowart-compact-select cowart-compact-select-surface">
                <span>粗细</span>
                <select value={shape.props.size} onChange={(event) => onChangeStyle({ size: event.target.value })}>
                  {SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function TextStyleSection({ shape, onChangeStyle }) {
  const shouldRenderTextSection = shouldShowTextStyleSection(shape)
  const canEditFont = supportsFont(shape)
  const canEditHorizontalAlign = supportsHorizontalAlign(shape)
  const canEditTextAlign = supportsTextAlign(shape)
  const canEditVerticalAlign = supportsVerticalAlign(shape)
  const canEditLabelColor = supportsLabelColor(shape)

  if (!shouldRenderTextSection) return null

  return (
    <section className="cowart-property-group cowart-property-group-text">
      <div className="cowart-property-group-header">
        <h4>文字</h4>
      </div>

      {(canEditFont || canEditHorizontalAlign || canEditTextAlign || canEditVerticalAlign) && (
        <div className="cowart-text-control-stack">
          {canEditFont && (
            <label className="cowart-compact-select cowart-compact-select-surface">
              <span>字体</span>
              <select value={shape.props.font} onChange={(event) => onChangeStyle({ font: event.target.value })}>
                {FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(canEditHorizontalAlign || canEditTextAlign || canEditVerticalAlign) && (
            <div className="cowart-text-segment-grid">
              {canEditHorizontalAlign && (
                <SegmentedControl
                  label="水平"
                  value={shape.props.align}
                  options={HORIZONTAL_ALIGN_BUTTONS}
                  onChange={(align) => onChangeStyle({ align })}
                />
              )}

              {canEditTextAlign && (
                <SegmentedControl
                  label="文本"
                  value={shape.props.textAlign}
                  options={TEXT_ALIGN_BUTTONS}
                  onChange={(textAlign) => onChangeStyle({ textAlign })}
                />
              )}

              {canEditVerticalAlign && (
                <SegmentedControl
                  label="垂直"
                  value={shape.props.verticalAlign}
                  options={VERTICAL_ALIGN_BUTTONS}
                  onChange={(verticalAlign) => onChangeStyle({ verticalAlign })}
                />
              )}
            </div>
          )}
        </div>
      )}

      {canEditLabelColor && (
        <ColorControl
          label="文字颜色"
          value={shape.props.labelColor}
          onChange={(labelColor) => onChangeStyle({ labelColor })}
        />
      )}

      {!canEditFont &&
        !canEditHorizontalAlign &&
        !canEditTextAlign &&
        !canEditVerticalAlign &&
        !canEditLabelColor && (
          <p className="cowart-section-empty">这个对象暂时没有可在右侧栏编辑的文字样式字段。</p>
        )}
    </section>
  )
}

function CanvasSettingsSection({
  settings,
  onChangeSettings,
  onResetSettings,
  annotationColorOptions
}) {
  const currentColor =
    annotationColorOptions.find((option) => option.value === settings.annotationColor) ??
    annotationColorOptions[0]

  return (
    <section className="cowart-inspector-section" aria-label="画板设置">
      <div className="cowart-selection-meta">
        <span className="cowart-selection-chip">canvas</span>
        <strong>当前画板</strong>
      </div>

      <section className="cowart-property-group cowart-property-group-canvas">
        <div className="cowart-property-group-header">
          <h4>显示</h4>
        </div>

        <label className="cowart-setting-row cowart-setting-row-surface">
          <span>背景色</span>
          <input
            type="color"
            value={settings.backgroundColor}
            onChange={(event) => onChangeSettings({ backgroundColor: event.target.value })}
            aria-label="背景色"
          />
        </label>

        <label className="cowart-setting-switch cowart-setting-switch-surface">
          <span>显示网格</span>
          <input
            type="checkbox"
            checked={settings.showGrid}
            onChange={(event) => onChangeSettings({ showGrid: event.target.checked })}
          />
        </label>
      </section>

      <section className="cowart-property-group cowart-property-group-canvas">
        <div className="cowart-property-group-header">
          <h4>默认尺寸</h4>
        </div>

        <div className="cowart-setting-grid cowart-setting-grid-surface" aria-label="AI 图片默认尺寸">
          <label>
            <span>宽</span>
            <input
              type="number"
              min="80"
              max="2400"
              step="10"
              value={settings.aiImageHolderWidth}
              onChange={(event) => onChangeSettings({ aiImageHolderWidth: event.target.value })}
            />
          </label>
          <label>
            <span>高</span>
            <input
              type="number"
              min="80"
              max="2400"
              step="10"
              value={settings.aiImageHolderHeight}
              onChange={(event) => onChangeSettings({ aiImageHolderHeight: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="cowart-property-group cowart-property-group-canvas">
        <div className="cowart-property-group-header">
          <h4>批注</h4>
        </div>

        <ColorControl
          label="批注颜色"
          value={currentColor.value}
          options={annotationColorOptions}
          onChange={(annotationColor) => onChangeSettings({ annotationColor })}
        />
      </section>

      <button className="cowart-settings-reset cowart-settings-reset-surface" type="button" onClick={onResetSettings}>
        恢复默认
      </button>
    </section>
  )
}

function ExportSection({ editor }) {
  const [format, setFormat] = useState('png')
  const [scale, setScale] = useState(2)
  const [includeBackground, setIncludeBackground] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  async function runExport({ format: nextFormat, scale: nextScale, background, scope = 'auto' }) {
    if (!editor) return

    const shapeIds = getExportTargetShapeIds(editor, scope)
    if (shapeIds.length === 0) {
      setExportMessage('当前页面没有可导出的内容。')
      return
    }

    setIsExporting(true)
    setExportMessage('')

    try {
      const result = await editor.toImage(shapeIds, {
        format: nextFormat,
        scale: nextScale,
        background
      })

      const fileBaseName =
        scope === 'page'
          ? `cowart-page-${editor.getCurrentPage().name}-${Date.now()}`
          : editor.getSelectedShapeIds().length > 0
            ? `cowart-selection-${Date.now()}`
            : `cowart-page-${editor.getCurrentPage().name}-${Date.now()}`

      triggerBlobDownload(result.blob, `${fileBaseName}.${nextFormat}`)
      setExportMessage(`已导出${getExportTargetLabel(editor, scope)}。`)
    } catch (error) {
      console.error(error)
      setExportMessage('导出失败，请重试。')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="cowart-inspector-section cowart-inspector-section-compact" aria-label="导出">
      <div className="cowart-style-stack">
        <div className="cowart-property-group-header">
          <h4>导出</h4>
        </div>
        <div className="cowart-preset-grid">
          {EXPORT_PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.value}
              className="cowart-preset-button"
              type="button"
              disabled={!editor || (preset.scope === 'selection' && getSelectionShapeIds(editor).length === 0) || isExporting}
              onClick={() => runExport(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <p className="cowart-section-note">
        {editor ? `导出目标：${getExportTargetLabel(editor)}` : '画布加载后可导出当前选中对象或当前页面。'}
      </p>

      <div className="cowart-inline-control-row">
        <label className="cowart-setting-stack">
          <span>格式</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            {EXPORT_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="cowart-setting-stack">
          <span>倍率</span>
          <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
            {EXPORT_SCALE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="cowart-setting-switch cowart-setting-switch-surface">
        <span>导出画板背景</span>
        <input
          type="checkbox"
          checked={includeBackground}
          onChange={(event) => setIncludeBackground(event.target.checked)}
        />
      </label>

      <button
        className="cowart-primary-action"
        type="button"
        onClick={() =>
          runExport({
            format,
            scale,
            background: includeBackground
          })
        }
        disabled={!editor || isExporting}
      >
        {isExporting ? '导出中...' : '自定义导出'}
      </button>

      {exportMessage ? <p className="cowart-section-note">{exportMessage}</p> : null}
    </section>
  )
}

export default function CowartInspector({
  editor,
  selectedShapes,
  settings,
  saveState,
  onChangeSettings,
  onResetSettings,
  annotationColorOptions
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('selection')

  function handleToggleInspector() {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    setActiveTab(selectedShapes.length > 0 ? 'selection' : 'canvas')
    setIsOpen(true)
  }

  return (
    <section
      className={`cowart-inspector ${isOpen ? 'cowart-inspector-open' : ''}`}
      aria-label="右侧属性面板"
    >
      <button
        className="cowart-inspector-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls="cowart-inspector-panel"
        onClick={handleToggleInspector}
        title={isOpen ? '关闭右侧栏' : '打开右侧栏'}
      >
        <span aria-hidden="true">{isOpen ? '×' : '☰'}</span>
      </button>

      {isOpen && (
        <aside
          id="cowart-inspector-panel"
          className="cowart-inspector-panel"
          aria-label="画板和属性设置"
        >
          <header className="cowart-inspector-header">
            <div className="cowart-inspector-header-copy">
              <h2>属性</h2>
              <p>对象与画板设置</p>
            </div>
            <span className="cowart-save-badge">{getSaveStateLabel(saveState)}</span>
            <button
              className="cowart-inspector-close"
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="关闭右侧栏"
              title="关闭"
            >
              ×
            </button>
          </header>

          <div className="cowart-inspector-body">
            <div className="cowart-inspector-tabs" role="tablist" aria-label="右侧栏内容切换">
              <button
                className="cowart-inspector-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === 'selection'}
                data-active={activeTab === 'selection' ? 'true' : 'false'}
                onClick={() => setActiveTab('selection')}
              >
                对象
              </button>
              <button
                className="cowart-inspector-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === 'canvas'}
                data-active={activeTab === 'canvas' ? 'true' : 'false'}
                onClick={() => setActiveTab('canvas')}
              >
                画板
              </button>
            </div>

            {activeTab === 'selection' ? (
              <>
                <SelectionSection editor={editor} selectedShapes={selectedShapes} />
                <ExportSection editor={editor} />
              </>
            ) : (
              <CanvasSettingsSection
                settings={settings}
                onChangeSettings={onChangeSettings}
                onResetSettings={onResetSettings}
                annotationColorOptions={annotationColorOptions}
              />
            )}
          </div>
        </aside>
      )}
    </section>
  )
}
