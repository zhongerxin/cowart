import { useCallback } from 'react'
import {
  Box,
  RichTextLabel,
  RichTextSVG,
  TextShapeUtil,
  NoteShapeUtil,
  createComputedCache,
  getColorValue,
  getDisplayValues,
  isEqual,
  renderHtmlFromRichText,
  renderHtmlFromRichTextForMeasurement,
  toRichText,
  useColorMode,
  useEditor
} from 'tldraw'
import {
  getCowartFontFamily,
  getCowartFontKey,
  getCowartFontSize
} from './cowartTextStyles.js'

const TEXT_PROPS = {
  fontWeight: 'normal',
  fontVariant: 'normal',
  fontStyle: 'normal'
}

const noteHorizontalAligns = {
  start: 'start',
  middle: 'center',
  end: 'end',
  'start-legacy': 'start',
  'end-legacy': 'end',
  'middle-legacy': 'center'
}

const noteVerticalAligns = {
  start: 'start',
  middle: 'middle',
  end: 'end'
}

const textSizeCache = createComputedCache(
  'cowart text size',
  (editor, shape) => {
    const util = editor.getShapeUtil(shape)
    const dv = getDisplayValues(util, shape)
    return getCowartTextSize(editor, shape.props, dv)
  },
  { areRecordsEqual: (a, b) => a.props === b.props && a.meta === b.meta }
)

function getTextColor(shape, theme, colorMode) {
  const colors = theme.colors[colorMode]
  if (shape.type === 'text') {
    return getColorValue(colors, shape.props.color, 'solid')
  }

  return shape.props.labelColor === 'black'
    ? getColorValue(colors, shape.props.color, 'noteText')
    : getColorValue(colors, shape.props.labelColor, 'fill')
}

function getTextWeight(shape) {
  const weight = Number(shape?.meta?.cowartTextFontWeight ?? 400)
  if (!Number.isFinite(weight)) return 400
  return Math.min(Math.max(Math.round(weight), 100), 900)
}

function getTextItalic(shape) {
  return shape?.meta?.cowartTextItalic === true
}

function getTextLineHeight(shape, fallback) {
  const lineHeight = Number(shape?.meta?.cowartTextLineHeight ?? fallback)
  if (!Number.isFinite(lineHeight)) return fallback
  return Math.min(Math.max(lineHeight, 0.8), 3)
}

function getTextLetterSpacing(shape) {
  const spacing = Number(shape?.meta?.cowartTextLetterSpacing ?? 0)
  if (!Number.isFinite(spacing)) return 0
  return Math.min(Math.max(Math.round(spacing * 10) / 10, -8), 40)
}

function getTextDecoration(shape) {
  const decorations = []
  if (shape?.meta?.cowartTextUnderline === true) decorations.push('underline')
  if (shape?.meta?.cowartTextStrike === true) decorations.push('line-through')
  return decorations.length ? decorations.join(' ') : 'none'
}

function getCowartTextDisplayValues(shape, theme, colorMode) {
  const fontSize = getCowartFontSize(shape)
  return {
    color: getTextColor(shape, theme, colorMode),
    fontFamily: getCowartFontFamily(getCowartFontKey(shape), shape.props.font),
    fontSize,
    lineHeight: getTextLineHeight(shape, theme.lineHeight),
    fontWeight: `${getTextWeight(shape)}`,
    fontStyle: getTextItalic(shape) ? 'italic' : TEXT_PROPS.fontStyle,
    fontVariant: TEXT_PROPS.fontVariant,
    letterSpacing: getTextLetterSpacing(shape),
    textDecoration: getTextDecoration(shape)
  }
}

function getCowartTextSize(editor, props, dv) {
  const richText = props.richText
  const minWidth = 16
  const maybeFixedWidth = props.autoSize ? null : Math.max(minWidth, Math.floor(props.w))
  const html = renderHtmlFromRichTextForMeasurement(editor, richText)
  const result = editor.textMeasure.measureHtml(html, {
    lineHeight: dv.lineHeight,
    fontWeight: dv.fontWeight,
    fontStyle: dv.fontStyle,
    padding: '0px',
    fontFamily: dv.fontFamily,
    fontSize: dv.fontSize,
    maxWidth: maybeFixedWidth,
    otherStyles: {
      'letter-spacing': `${dv.letterSpacing}px`
    }
  })

  return {
    width: maybeFixedWidth ?? Math.max(minWidth, result.w + 1),
    height: Math.max(dv.fontSize, result.h)
  }
}

function getNoteHeight(shape, noteHeight) {
  return (noteHeight + shape.props.growY) * shape.props.scale
}

function getTextRenderStyle(dv, scale = 1) {
  return {
    fontWeight: dv.fontWeight,
    fontStyle: dv.fontStyle,
    letterSpacing: `${dv.letterSpacing}px`,
    textDecoration: dv.textDecoration,
    transform: `scale(${scale})`,
    transformOrigin: 'top left'
  }
}

function CowartRichTextSvg({
  bounds,
  richText,
  fontSize,
  fontFamily,
  lineHeight,
  textAlign,
  verticalAlign,
  wrap,
  labelColor,
  padding,
  fontWeight,
  fontStyle,
  letterSpacing,
  textDecoration,
  showTextOutline = true
}) {
  const editor = useEditor()
  const html = renderHtmlFromRichText(editor, richText)
  const justifyContent = textAlign === 'center' ? 'center' : textAlign === 'start' ? 'flex-start' : 'flex-end'
  const alignItems = verticalAlign === 'middle' ? 'center' : verticalAlign === 'start' ? 'flex-start' : 'flex-end'

  return (
    <foreignObject
      x={bounds.minX}
      y={bounds.minY}
      width={bounds.w}
      height={bounds.h}
      className={showTextOutline ? 'tl-export-embed-styles tl-rich-text tl-text__outline' : 'tl-export-embed-styles tl-rich-text tl-text__no-outline'}
    >
      <div
        style={{
          display: 'flex',
          fontFamily,
          height: '100%',
          justifyContent,
          alignItems,
          padding: `${padding}px`
        }}
      >
        <div
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            fontSize: `${fontSize}px`,
            wrap: wrap ? 'wrap' : 'nowrap',
            color: labelColor,
            lineHeight,
            textAlign,
            width: '100%',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            textShadow: showTextOutline ? 'var(--tl-text-outline)' : 'none',
            tabSize: 'var(--tl-tab-size, 2)',
            fontWeight,
            fontStyle,
            letterSpacing: `${letterSpacing}px`,
            textDecoration
          }}
        />
      </div>
    </foreignObject>
  )
}

function useTextShapeKeydownHandler(id) {
  const editor = useEditor()

  return useCallback(
    (event) => {
      if (editor.getEditingShapeId() !== id) return
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        editor.complete()
      }
    },
    [editor, id]
  )
}

export class CowartTextShapeUtil extends TextShapeUtil {
  options = {
    ...this.options,
    getDefaultDisplayValues: (_editor, shape, theme, colorMode) =>
      getCowartTextDisplayValues(shape, theme, colorMode)
  }

  getDefaultProps() {
    return {
      color: 'black',
      size: 'm',
      w: 8,
      font: 'draw',
      textAlign: 'start',
      autoSize: true,
      scale: 1,
      richText: toRichText('')
    }
  }

  getMinDimensions(shape) {
    return textSizeCache.get(this.editor, shape.id)
  }

  getFontFaces() {
    return []
  }

  component(shape) {
    const {
      id,
      props: { richText, scale, textAlign }
    } = shape
    const { width, height } = this.getMinDimensions(shape)
    const isSelected = shape.id === this.editor.getOnlySelectedShapeId()
    const colorMode = useColorMode()
    const dv = getDisplayValues(this, shape, colorMode)
    const handleKeyDown = useTextShapeKeydownHandler(id)

    return (
      <RichTextLabel
        shapeId={id}
        classNamePrefix="tl-text-shape"
        type="text"
        fontFamily={dv.fontFamily}
        fontSize={dv.fontSize}
        lineHeight={dv.lineHeight}
        textAlign={textAlign === 'middle' ? 'center' : textAlign}
        verticalAlign="middle"
        richText={richText}
        labelColor={dv.color}
        isSelected={isSelected}
        textWidth={width}
        textHeight={height}
        showTextOutline={this.options.showTextOutline}
        style={getTextRenderStyle(dv, scale)}
        wrap
        onKeyDown={handleKeyDown}
      />
    )
  }

  toSvg(shape, ctx) {
    const bounds = this.editor.getShapeGeometry(shape).bounds
    const width = bounds.width / (shape.props.scale ?? 1)
    const height = bounds.height / (shape.props.scale ?? 1)
    const dv = getDisplayValues(this, shape, ctx.colorMode)
    const exportBounds = new Box(0, 0, width, height)

    return (
      <CowartRichTextSvg
        fontSize={dv.fontSize}
        fontFamily={dv.fontFamily}
        lineHeight={dv.lineHeight}
        textAlign={shape.props.textAlign === 'middle' ? 'center' : shape.props.textAlign}
        verticalAlign="middle"
        richText={shape.props.richText}
        labelColor={dv.color}
        bounds={exportBounds}
        padding={0}
        fontWeight={dv.fontWeight}
        fontStyle={dv.fontStyle}
        letterSpacing={dv.letterSpacing}
        textDecoration={dv.textDecoration}
        showTextOutline={this.options.showTextOutline}
      />
    )
  }

  onBeforeUpdate(prev, next) {
    if (!next.props.autoSize) return

    const styleDidChange =
      prev.props.size !== next.props.size ||
      prev.props.textAlign !== next.props.textAlign ||
      prev.props.font !== next.props.font ||
      prev.meta?.cowartTextFontFamily !== next.meta?.cowartTextFontFamily ||
      prev.meta?.cowartTextFontSize !== next.meta?.cowartTextFontSize ||
      (prev.props.scale !== 1 && next.props.scale === 1)

    const textDidChange = !isEqual(prev.props.richText, next.props.richText)
    if (!styleDidChange && !textDidChange) return

    return super.onBeforeUpdate(prev, next)
  }
}

export class CowartNoteShapeUtil extends NoteShapeUtil {
  options = {
    ...this.options,
    getDefaultDisplayValues: (_editor, shape, theme, colorMode) => {
      const { color, size, align, verticalAlign } = shape.props
      const colors = theme.colors[colorMode]
      const fontSize = getCowartFontSize(shape)
      return {
        noteWidth: 200,
        noteHeight: 200,
        noteBackgroundColor: getColorValue(colors, color, 'noteFill'),
        borderColor: colors.noteBorder,
        borderWidth: 2,
        labelColor: getTextColor(shape, theme, colorMode),
        labelFontFamily: getCowartFontFamily(getCowartFontKey(shape), shape.props.font),
        labelFontSize: fontSize,
        labelLineHeight: theme.lineHeight,
        labelFontWeight: TEXT_PROPS.fontWeight,
        labelFontVariant: TEXT_PROPS.fontVariant,
        labelFontStyle: TEXT_PROPS.fontStyle,
        labelPadding: 16,
        labelHorizontalAlign: noteHorizontalAligns[align],
        labelVerticalAlign: noteVerticalAligns[verticalAlign]
      }
    }
  }

  getDefaultProps() {
    return {
      color: 'black',
      richText: toRichText(''),
      size: 'm',
      font: 'draw',
      align: 'middle',
      verticalAlign: 'middle',
      labelColor: 'black',
      growY: 0,
      fontSizeAdjustment: 1,
      url: '',
      scale: 1,
      textFirstEditedBy: null
    }
  }

  getFontFaces() {
    return []
  }

  component(shape) {
    const { id, type, props } = shape
    const { scale, richText, fontSizeAdjustment } = props
    const colorMode = useColorMode()
    const dv = getDisplayValues(this, shape, colorMode)
    const isSelected = shape.id === this.editor.getOnlySelectedShapeId()
    const noteHeight = getNoteHeight(shape, dv.noteHeight)
    const handleKeyDown = useTextShapeKeydownHandler(id)

    return (
      <div
        id={id}
        className="tl-note__container"
        style={{
          width: dv.noteWidth * scale,
          height: noteHeight,
          backgroundColor: dv.noteBackgroundColor
        }}
      >
        <RichTextLabel
          shapeId={id}
          type={type}
          fontFamily={dv.labelFontFamily}
          fontSize={(fontSizeAdjustment ?? 1) * dv.labelFontSize}
          lineHeight={dv.labelLineHeight}
          textAlign={dv.labelHorizontalAlign}
          verticalAlign={dv.labelVerticalAlign}
          richText={richText}
          isSelected={isSelected}
          labelColor={dv.labelColor}
          wrap
          padding={dv.labelPadding}
          hasCustomTabBehavior
          showTextOutline={false}
          onKeyDown={handleKeyDown}
          style={
            scale !== 1
              ? {
                  ...getTextRenderStyle(dv, scale),
                  width: dv.noteWidth,
                  height: dv.noteHeight + shape.props.growY
                }
              : getTextRenderStyle(dv)
          }
        />
      </div>
    )
  }

  toSvg(shape, ctx) {
    const dv = getDisplayValues(this, shape, ctx.colorMode)
    const bounds = new Box(0, 0, dv.noteWidth, dv.noteHeight + shape.props.growY)

    return (
      <>
        <rect rx={1} width={dv.noteWidth} height={bounds.h} fill={dv.noteBackgroundColor} />
        <CowartRichTextSvg
          fontSize={(shape.props.fontSizeAdjustment ?? 1) * dv.labelFontSize}
          fontFamily={dv.labelFontFamily}
          lineHeight={dv.labelLineHeight}
          textAlign={dv.labelHorizontalAlign}
          verticalAlign={dv.labelVerticalAlign}
          richText={shape.props.richText}
          labelColor={dv.labelColor}
          bounds={bounds}
          padding={dv.labelPadding}
          fontWeight={dv.labelFontWeight}
          fontStyle={dv.labelFontStyle}
          letterSpacing={dv.letterSpacing}
          textDecoration={dv.textDecoration}
          showTextOutline={false}
        />
      </>
    )
  }

  onBeforeUpdate(prev, next) {
    const metaChanged =
      prev.meta?.cowartTextFontFamily !== next.meta?.cowartTextFontFamily ||
      prev.meta?.cowartTextFontSize !== next.meta?.cowartTextFontSize

    if (!metaChanged) {
      return super.onBeforeUpdate(prev, next)
    }

    const forcedPrev =
      prev.props.font === next.props.font && prev.props.size === next.props.size
        ? {
            ...prev,
            props: {
              ...prev.props,
              font: '__cowart_force__'
            }
          }
        : prev

    const baseNext = super.onBeforeUpdate(forcedPrev, next) ?? next

    return {
      ...baseNext,
      props: {
        ...baseNext.props,
        fontSizeAdjustment: 1
      }
    }
  }
}
