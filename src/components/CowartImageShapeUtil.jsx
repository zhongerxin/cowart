import { memo } from 'react'
import {
  HTMLContainer,
  ImageShapeUtil,
  MediaHelpers,
  getUncroppedSize,
  useEditor,
  useImageOrVideoAsset,
  useValue
} from 'tldraw'

const imageSvgExportCache = new WeakMap()
const IMAGE_BORDER_SWATCHES = {
  black: '#1f2430',
  grey: '#697386',
  'light-violet': '#b8a3ff',
  violet: '#7c3aed',
  blue: '#3e63dd',
  'light-blue': '#8ec5ff',
  yellow: '#f5d90a',
  orange: '#f76b15',
  green: '#30a46c',
  'light-green': '#8fd19e',
  'light-red': '#f39aa0',
  red: '#e5484d',
  white: '#ffffff'
}

function clampImageCornerRadius(shape, value) {
  const width = Number(shape?.props?.w) || 0
  const height = Number(shape?.props?.h) || 0
  const maxRadius = Math.max(0, Math.floor(Math.min(width, height) / 2))
  const radius = Number(value)
  if (!Number.isFinite(radius)) return 0
  return Math.min(Math.max(Math.round(radius), 0), maxRadius)
}

function getImageCornerRadius(shape) {
  return clampImageCornerRadius(shape, shape?.meta?.cowartImageCornerRadius ?? 0)
}

function getImageBorderRadius(shape) {
  if (shape.props.crop?.isCircle) return '50%'
  const radius = getImageCornerRadius(shape)
  return radius > 0 ? `${radius}px` : undefined
}

function getImageBorderWidth(shape) {
  const width = Number(shape?.meta?.cowartImageBorderWidth ?? 0)
  if (!Number.isFinite(width)) return 0
  return Math.min(Math.max(Math.round(width), 0), 24)
}

function getImageBorderColor(shape) {
  const key = shape?.meta?.cowartImageBorderColor
  if (typeof key === 'string' && IMAGE_BORDER_SWATCHES[key]) {
    return IMAGE_BORDER_SWATCHES[key]
  }
  return IMAGE_BORDER_SWATCHES.black
}

function getImageShadow(shape) {
  const strength = Number(shape?.meta?.cowartImageShadow ?? 0)
  if (!Number.isFinite(strength)) return 0
  return Math.min(Math.max(Math.round(strength), 0), 100)
}

function getImageBlur(shape) {
  const blur = Number(shape?.meta?.cowartImageBlur ?? 0)
  if (!Number.isFinite(blur)) return 0
  return Math.min(Math.max(Math.round(blur), 0), 40)
}

function getImageShadowColor(shape) {
  const key = shape?.meta?.cowartImageShadowColor
  if (typeof key === 'string' && IMAGE_BORDER_SWATCHES[key]) {
    return IMAGE_BORDER_SWATCHES[key]
  }
  return IMAGE_BORDER_SWATCHES.black
}

function hexToRgb(color) {
  const normalized = typeof color === 'string' ? color.replace('#', '') : ''
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { r: 15, g: 23, b: 42 }
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  }
}

function getImageBoxShadow(shape) {
  const shadow = getImageShadow(shape)
  if (shadow <= 0) return undefined
  const blur = 10 + shadow * 0.36
  const offsetY = 4 + shadow * 0.12
  const alpha = Math.min(0.28, 0.06 + shadow * 0.0022)
  const color = hexToRgb(getImageShadowColor(shape))
  return `0 ${offsetY}px ${blur}px rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

function getImageFrameStyle(shape) {
  const borderWidth = getImageBorderWidth(shape)
  const borderColor = getImageBorderColor(shape)
  const borderRadius = getImageBorderRadius(shape)
  return {
    overflow: 'hidden',
    width: shape.props.w,
    height: shape.props.h,
    borderRadius,
    border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
    boxShadow: getImageBoxShadow(shape),
    boxSizing: 'border-box'
  }
}

function getImageElementStyle(shape) {
  const blur = getImageBlur(shape)
  const baseStyle = getFlipStyle(shape)
  const filter = blur > 0 ? `blur(${blur}px)` : undefined

  if (!baseStyle && !filter) return undefined

  return {
    ...(baseStyle ?? {}),
    filter
  }
}

function getCroppedContainerStyle(shape) {
  const crop = shape.props.crop
  const topLeft = crop?.topLeft
  if (!topLeft) {
    return {
      width: shape.props.w,
      height: shape.props.h
    }
  }

  const { w, h } = getUncroppedSize(shape.props, crop)
  const offsetX = -topLeft.x * w
  const offsetY = -topLeft.y * h

  return {
    transform: `translate(${offsetX}px, ${offsetY}px)`,
    width: w,
    height: h
  }
}

function modulate(value, [fromMin, fromMax], [toMin, toMax]) {
  if (fromMax === fromMin) return toMin
  const progress = (value - fromMin) / (fromMax - fromMin)
  return toMin + progress * (toMax - toMin)
}

function getFlipStyle(shape, size) {
  const { flipX, flipY, crop } = shape.props
  if (!flipX && !flipY) return undefined

  let cropOffsetX
  let cropOffsetY
  if (crop) {
    const { w, h } = getUncroppedSize(shape.props, crop)
    const cropWidth = crop.bottomRight.x - crop.topLeft.x
    const cropHeight = crop.bottomRight.y - crop.topLeft.y

    cropOffsetX = modulate(crop.topLeft.x, [0, 1 - cropWidth], [0, w - shape.props.w])
    cropOffsetY = modulate(crop.topLeft.y, [0, 1 - cropHeight], [0, h - shape.props.h])
  }

  const scale = `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`
  const translate = size
    ? `translate(${(flipX ? size.width : 0) - (cropOffsetX ? cropOffsetX : 0)}px, ${(flipY ? size.height : 0) - (cropOffsetY ? cropOffsetY : 0)}px)`
    : ''

  return {
    transform: `${translate} ${scale}`.trim(),
    transformOrigin: size ? '0 0' : 'center center'
  }
}

function assetIsAnimated(asset) {
  if (!asset) return false

  return (
    ('mimeType' in asset.props && MediaHelpers.isAnimatedImageType(asset.props.mimeType)) ||
    ('isAnimated' in asset.props && asset.props.isAnimated)
  )
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function getDataUriFromUrl(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  return blobToDataUrl(blob)
}

function getFirstFrameOfAnimatedImage(url) {
  let cancelled = false

  const promise = new Promise((resolve) => {
    const image = new window.Image()
    image.onload = () => {
      if (cancelled) return

      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(url)
        return
      }

      ctx.drawImage(image, 0, 0)
      resolve(canvas.toDataURL())
    }
    image.crossOrigin = 'anonymous'
    image.src = url
  })

  return {
    promise,
    cancel() {
      cancelled = true
    }
  }
}

function getImageClipMarkup(shape, width, height) {
  const crop = shape.props.crop
  const radius = clampImageCornerRadius(shape, getImageCornerRadius(shape))
  const borderWidth = Math.min(getImageBorderWidth(shape), width / 2, height / 2)
  const insetX = borderWidth / 2
  const insetY = borderWidth / 2
  const insetWidth = Math.max(0, width - borderWidth)
  const insetHeight = Math.max(0, height - borderWidth)

  if (crop?.isCircle) {
    return <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} />
  }

  if (radius > 0) {
    const clippedRadius = Math.min(radius, insetWidth / 2, insetHeight / 2)
    return (
      <rect
        x={insetX}
        y={insetY}
        width={insetWidth}
        height={insetHeight}
        rx={clippedRadius}
        ry={clippedRadius}
      />
    )
  }

  return <rect x={insetX} y={insetY} width={insetWidth} height={insetHeight} />
}

function getSvgBorderMarkup(shape, width, height) {
  const borderWidth = getImageBorderWidth(shape)
  if (borderWidth <= 0) return null

  const color = getImageBorderColor(shape)
  const half = borderWidth / 2

  if (shape.props.crop?.isCircle) {
    return (
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={Math.max(0, width / 2 - half)}
        ry={Math.max(0, height / 2 - half)}
        fill="none"
        stroke={color}
        strokeWidth={borderWidth}
      />
    )
  }

  const radius = Math.min(getImageCornerRadius(shape), (width - borderWidth) / 2, (height - borderWidth) / 2)
  return (
    <rect
      x={half}
      y={half}
      width={Math.max(0, width - borderWidth)}
      height={Math.max(0, height - borderWidth)}
      rx={Math.max(0, radius)}
      ry={Math.max(0, radius)}
      fill="none"
      stroke={color}
      strokeWidth={borderWidth}
    />
  )
}

function SvgImage({ shape, src }) {
  const crop = shape.props.crop
  const containerStyle = getCroppedContainerStyle(shape)
  const hasRoundedCorners = getImageCornerRadius(shape) > 0
  const clipId = `cowart-image-clip-${String(shape.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`

  if (containerStyle.transform && crop) {
    const { transform: cropTransform, width, height } = containerStyle
    const croppedWidth = (crop.bottomRight.x - crop.topLeft.x) * width
    const croppedHeight = (crop.bottomRight.y - crop.topLeft.y) * height
    const flipStyle = getFlipStyle(shape, { width, height })

    return (
      <>
        <defs>
          <clipPath id={clipId}>{getImageClipMarkup(shape, croppedWidth, croppedHeight)}</clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <image
            href={src}
            width={width}
            height={height}
            aria-label={shape.props.altText}
            style={flipStyle ? { ...flipStyle } : { transform: cropTransform }}
          />
        </g>
        {getSvgBorderMarkup(shape, croppedWidth, croppedHeight)}
      </>
    )
  }

  if (crop?.isCircle || hasRoundedCorners) {
    return (
      <>
        <defs>
          <clipPath id={clipId}>{getImageClipMarkup(shape, shape.props.w, shape.props.h)}</clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <image
            href={src}
            width={shape.props.w}
            height={shape.props.h}
            aria-label={shape.props.altText}
            style={getFlipStyle(shape, { width: shape.props.w, height: shape.props.h })}
          />
        </g>
        {getSvgBorderMarkup(shape, shape.props.w, shape.props.h)}
      </>
    )
  }

  return (
    <>
      <image
        href={src}
        width={shape.props.w}
        height={shape.props.h}
        aria-label={shape.props.altText}
        style={getFlipStyle(shape, { width: shape.props.w, height: shape.props.h })}
      />
      {getSvgBorderMarkup(shape, shape.props.w, shape.props.h)}
    </>
  )
}

const CowartImageShape = memo(function CowartImageShape({ shape }) {
  const editor = useEditor()
  const { w } = getUncroppedSize(shape.props, shape.props.crop)
  const { asset, url } = useImageOrVideoAsset({
    shapeId: shape.id,
    assetId: shape.props.assetId,
    width: w
  })

  const showCropPreview = useValue(
    'show crop preview',
    () =>
      shape.id === editor.getOnlySelectedShapeId() &&
      editor.getCroppingShapeId() === shape.id &&
      editor.isIn('select.crop'),
    [editor, shape.id]
  )

  const frameStyle = getImageFrameStyle(shape)
  const containerStyle = getCroppedContainerStyle(shape)
  const imageStyle = getImageElementStyle(shape)

  if (!url && !asset?.props?.src) {
    return (
      <HTMLContainer
        id={shape.id}
        style={{
          ...frameStyle,
          color: 'var(--tl-color-text-3)',
          backgroundColor: 'var(--tl-color-low)',
          border: frameStyle.border ?? '1px solid var(--tl-color-low-border)'
        }}
      >
        <div
          className="tl-image-container"
          style={{
            ...containerStyle,
            display: 'grid',
            placeItems: 'center',
            color: 'inherit'
          }}
        >
          资源不可用
        </div>
      </HTMLContainer>
    )
  }

  const src = url ?? asset?.props?.src ?? ''

  return (
    <>
      {showCropPreview && src ? (
        <div style={frameStyle}>
          <div className="tl-image-container" style={containerStyle}>
            <img
              className="tl-image"
              style={{ ...imageStyle, opacity: 0.1 }}
              src={src}
              referrerPolicy="strict-origin-when-cross-origin"
              draggable={false}
              alt=""
            />
          </div>
        </div>
      ) : null}
      <HTMLContainer
        id={shape.id}
        style={frameStyle}
      >
        <div className="tl-image-container" style={containerStyle}>
          <img
            className="tl-image"
            style={imageStyle}
            src={src}
            referrerPolicy="strict-origin-when-cross-origin"
            draggable={false}
            alt={shape.props.altText}
          />
        </div>
      </HTMLContainer>
    </>
  )
})

export class CowartImageShapeUtil extends ImageShapeUtil {
  static type = 'image'

  component(shape) {
    return <CowartImageShape shape={shape} />
  }

  async toSvg(shape, ctx) {
    const props = shape.props
    if (!props.assetId) return null

    const asset = this.editor.getAsset(props.assetId)
    if (!asset) return null

    const { w } = getUncroppedSize(shape.props, props.crop)
    let srcPromise = imageSvgExportCache.get(asset)

    if (!srcPromise) {
      srcPromise = (async () => {
        let src = await ctx.resolveAssetUrl(asset.id, w)
        if (!src) return null

        if (
          src.startsWith('blob:') ||
          src.startsWith('http') ||
          src.startsWith('/') ||
          src.startsWith('./')
        ) {
          src = await getDataUriFromUrl(src)
        }

        if (assetIsAnimated(asset)) {
          const { promise } = getFirstFrameOfAnimatedImage(src)
          src = await promise
        }

        return src
      })()

      imageSvgExportCache.set(asset, srcPromise)
    }

    const src = await srcPromise
    if (!src) return null

    return <SvgImage shape={shape} src={src} />
  }
}
