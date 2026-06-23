import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultToolbar,
  DefaultColorStyle,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  FrameShapeUtil,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StateNode,
  StarToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiMenuToolItem,
  TriangleToolbarItem,
  XBoxToolbarItem,
  createTLStore,
  createShapeId,
  onDragFromToolbarToCreateShape,
  startEditingShapeWithRichText,
  toRichText,
  useEditor,
  useValue
} from 'tldraw'
import { AllSelection } from '@tiptap/pm/state'
import 'tldraw/tldraw.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import annotationToolIconRaw from './assets/tool-comment.svg?raw'
import {
  findCowartImageMapRegion,
  getCowartImageMapFromRecords,
} from './imageMap.js'

const CANVAS_ENDPOINT = '/api/canvas'
const CANVAS_EVENTS_ENDPOINT = '/api/canvas-events'
const SELECTION_ENDPOINT = '/api/selection'
const VIEW_STATE_ENDPOINT = '/api/view-state'
const SELECTION_STATE_ELEMENT_ID = 'cowart-selection-state'
const AI_IMAGE_TOOL_ID = 'ai-image'
const AI_IMAGE_HOLDER_LABEL = 'AI 图片'
const AI_IMAGE_HOLDER_DEFAULT_W = 512
const AI_IMAGE_HOLDER_DEFAULT_H = 683
const AI_IMAGE_SIZE_MIN = 16
const AI_IMAGE_SIZE_MAX = 8192
const AI_IMAGE_ASPECT_PRESETS = [
  { id: '1-1', label: '1:1', w: 512, h: 512 },
  { id: '3-2', label: '3:2', w: 768, h: 512 },
  { id: '2-3', label: '2:3', w: 512, h: 768 },
  { id: '4-3', label: '4:3', w: 683, h: 512 },
  { id: '3-4', label: '3:4', w: 512, h: 683 },
  { id: '16-9', label: '16:9', w: 1024, h: 576 },
  { id: '9-16', label: '9:16', w: 512, h: 910 }
]
const ANNOTATION_TOOL_ID = 'cowart-annotation'
const ANNOTATION_TOOL_LABEL = '标注'
const ANNOTATION_DEFAULT_COLOR = 'red'
const ANNOTATION_MIN_LENGTH = 8
const ANNOTATION_BEND_RATIO = 0.12
const ANNOTATION_MIN_BEND = 16
const ANNOTATION_MAX_BEND = 48
const ANNOTATION_LABEL_POSITION = 0
const ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS = 8
const ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS = 4
const IMAGE_REGION_OVERLAY_MIN_SIZE = 8
const QUICK_ANNOTATION_OFFSET_X = 32
const QUICK_ANNOTATION_OFFSET_Y = 40
const annotationToolIconSvg = annotationToolIconRaw.replaceAll('black', 'currentColor')
const annotationToolIcon = (
  <div
    className="cowart-annotation-tool-icon"
    dangerouslySetInnerHTML={{ __html: annotationToolIconSvg }}
  />
)

function isCanvasSnapshot(value) {
  return value && typeof value === 'object' && value.store && value.schema
}

function firstErrorLine(error) {
  return error instanceof Error ? error.message.split('\n')[0] : String(error).split('\n')[0]
}

function describeSkippedRecord(record, reason) {
  return {
    id: typeof record?.id === 'string' ? record.id : '(missing id)',
    typeName: typeof record?.typeName === 'string' ? record.typeName : '(missing typeName)',
    type: typeof record?.type === 'string' ? record.type : null,
    reason: firstErrorLine(reason)
  }
}

function getRecordDependencies(record) {
  const dependencies = []
  if (record?.typeName === 'shape') {
    if (typeof record.parentId === 'string') dependencies.push(record.parentId)
    if (record.type === 'image' && typeof record.props?.assetId === 'string') {
      dependencies.push(record.props.assetId)
    }
  }
  if (record?.typeName === 'binding') {
    const fromId = record.fromId ?? record.props?.fromId
    const toId = record.toId ?? record.props?.toId
    if (typeof fromId === 'string') dependencies.push(fromId)
    if (typeof toId === 'string') dependencies.push(toId)
  }
  return dependencies
}

function pruneRecordsWithMissingDependencies(store, skippedRecords) {
  const prunedStore = { ...store }
  let changed = true

  while (changed) {
    changed = false
    for (const record of Object.values(prunedStore)) {
      const missingDependency = getRecordDependencies(record).find((id) => !prunedStore[id])
      if (!missingDependency) continue

      delete prunedStore[record.id]
      skippedRecords.push(
        describeSkippedRecord(record, `Missing dependent record: ${missingDependency}`)
      )
      changed = true
    }
  }

  return prunedStore
}

function sanitizeCanvasSnapshotForTldraw(snapshot) {
  if (!isCanvasSnapshot(snapshot)) {
    return { snapshot: null, skippedRecords: [] }
  }

  const validationStore = createTLStore()
  const skippedRecords = []
  let migratedSnapshot

  try {
    migratedSnapshot = validationStore.migrateSnapshot(snapshot)
  } catch (error) {
    return {
      snapshot: null,
      skippedRecords: [
        {
          id: '(snapshot)',
          typeName: 'snapshot',
          type: null,
          reason: firstErrorLine(error)
        }
      ]
    }
  }

  const validStore = {}
  for (const record of Object.values(migratedSnapshot.store)) {
    try {
      validationStore.put([record], 'initialize')
      validStore[record.id] = validationStore.get(record.id)
    } catch (error) {
      skippedRecords.push(describeSkippedRecord(record, error))
    }
  }

  return {
    snapshot: {
      schema: migratedSnapshot.schema,
      store: pruneRecordsWithMissingDependencies(validStore, skippedRecords)
    },
    skippedRecords
  }
}

function recordsAreEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function storeChangedSinceSnapshot(editor, baselineStore) {
  const currentStore = editor.store.getStoreSnapshot().store
  const baselineIds = new Set(Object.keys(baselineStore))

  for (const [id, baselineRecord] of Object.entries(baselineStore)) {
    const currentRecord = currentStore[id]
    if (!currentRecord) return true
    if (!recordsAreEqual(currentRecord, baselineRecord)) return true
  }

  for (const id of Object.keys(currentStore)) {
    if (!baselineIds.has(id)) return true
  }

  return false
}

function applyRemoteCanvasSnapshot(editor, snapshot, { preserveLocalChanges = false } = {}) {
  if (!isCanvasSnapshot(snapshot)) return { changedRecords: 0, skippedRecords: [] }

  const sanitized = sanitizeCanvasSnapshotForTldraw(snapshot)
  if (!sanitized.snapshot) return { changedRecords: 0, skippedRecords: sanitized.skippedRecords }

  const recordsToPut = Object.values(sanitized.snapshot.store).filter((record) => {
    const localRecord = editor.store.get(record.id)
    if (!localRecord) return true
    if (preserveLocalChanges) return false
    return !recordsAreEqual(localRecord, record)
  })

  if (recordsToPut.length === 0) {
    return { changedRecords: 0, skippedRecords: sanitized.skippedRecords }
  }

  let changedRecords = 0
  editor.store.mergeRemoteChanges(() => {
    for (const record of recordsToPut) {
      try {
        editor.store.put([record])
        changedRecords += 1
      } catch (error) {
        sanitized.skippedRecords.push(describeSkippedRecord(record, error))
      }
    }
  })

  return { changedRecords, skippedRecords: sanitized.skippedRecords }
}

function getAiImageHolderMeta() {
  return {
    cowartAiImageHolder: true,
    cowartAiImageHolderVersion: 1
  }
}

function isAiImageHolderShape(shape) {
  return shape?.type === 'frame' && shape.meta?.cowartAiImageHolder === true
}

function isAiImageAspectLocked(shape) {
  return isAiImageHolderShape(shape) && shape.meta?.cowartAiAspectLocked === true
}

function clampAiImageSize(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(Math.min(Math.max(value, AI_IMAGE_SIZE_MIN), AI_IMAGE_SIZE_MAX))
}

function getAiImageAspectRatio(shape) {
  const metaRatio = Number(shape?.meta?.cowartAiAspectRatio)
  if (Number.isFinite(metaRatio) && metaRatio > 0) return metaRatio

  const w = Number(shape?.props?.w)
  const h = Number(shape?.props?.h)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null

  return w / h
}

function getAiImageAspectPreset(shape) {
  if (!shape?.props) return null

  const w = Number(shape.props.w)
  const h = Number(shape.props.h)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null

  const shapeRatio = w / h
  return (
    AI_IMAGE_ASPECT_PRESETS.find((preset) => {
      const presetRatio = preset.w / preset.h
      return Math.abs(shapeRatio - presetRatio) < 0.01
    }) ?? null
  )
}

function formatAiImageSize(value) {
  return String(Math.round(Number.isFinite(value) ? value : 0))
}

function getAspectIconStyle(preset) {
  const maxSize = 22
  const scale = Math.min(maxSize / preset.w, maxSize / preset.h)
  return {
    width: `${Math.max(8, Math.round(preset.w * scale))}px`,
    height: `${Math.max(8, Math.round(preset.h * scale))}px`
  }
}

function createAiImageHolderShape(editor, id, shapeOverrides = {}) {
  const scale = editor.getResizeScaleFactor()
  const { meta, props, ...shapeRecordOverrides } = shapeOverrides
  const { scale: _scale, ...frameProps } = props ?? {}

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'frame',
    meta: {
      ...getAiImageHolderMeta(),
      ...meta
    },
    props: {
      w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
      h: AI_IMAGE_HOLDER_DEFAULT_H * scale,
      name: AI_IMAGE_HOLDER_LABEL,
      color: 'blue',
      ...frameProps
    }
  })
}

function createAiImageHolderAtViewportCenter(editor) {
  const scale = editor.getResizeScaleFactor()
  const w = AI_IMAGE_HOLDER_DEFAULT_W * scale
  const h = AI_IMAGE_HOLDER_DEFAULT_H * scale
  const center = editor.getViewportPageBounds().center
  const id = createShapeId()

  createAiImageHolderShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    props: { w, h }
  })
  editor.select(id)
  editor.setCurrentTool('select.idle')
}

function startEditingAnnotationArrowLabel(editor, arrowId) {
  const shape = editor.getShape(arrowId)
  if (!shape || !editor.canEditShape(shape)) {
    return
  }

  editor.select(arrowId)
  startEditingShapeWithRichText(editor, arrowId, { selectAll: true })
  pinAnnotationArrowLabelPosition(editor, arrowId)
  editor.getCurrentTool().setCurrentToolIdMask(ANNOTATION_TOOL_ID)
  selectAnnotationTextWhenReady(editor, arrowId)
}

function pinAnnotationArrowLabelPosition(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const shape = editor.getShape(arrowId)
    if (!shape || shape.meta?.cowartAnnotationArrow !== true) return
    if (shape.props.labelPosition !== ANNOTATION_LABEL_POSITION) {
      editor.updateShapes([
        {
          id: arrowId,
          type: 'arrow',
          props: {
            labelPosition: ANNOTATION_LABEL_POSITION
          }
        }
      ])
    }

    if (attempt < 2 && editor.getEditingShapeId() === arrowId) {
      pinAnnotationArrowLabelPosition(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function unlockGlobalToolLock(editor) {
  if (!editor.getInstanceState().isToolLocked) return
  editor.updateInstanceState({ isToolLocked: false })
}

function selectAnnotationTextWhenReady(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const editingShapeId = editor.getEditingShapeId()
    if (editingShapeId !== arrowId) return

    const textEditor = editor.getRichTextEditor()
    if (textEditor) {
      textEditor.view.focus()
      textEditor.view.dispatch(
        textEditor.state.tr.setSelection(new AllSelection(textEditor.state.doc)).scrollIntoView()
      )
    }

    const didSelectText = selectAnnotationTextRange(editor, arrowId)
    if (didSelectText && attempt >= ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS) {
      return
    }

    if (attempt < ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS) {
      selectAnnotationTextWhenReady(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function selectAnnotationTextRange(editor, arrowId) {
  const doc = editor.getContainerDocument()
  const shapeElement = Array.from(doc.querySelectorAll('[data-shape-id]')).find(
    (element) => element.getAttribute('data-shape-id') === arrowId
  )
  const editable = shapeElement?.querySelector('[contenteditable="true"]')

  if (!editable || typeof editable.focus !== 'function') {
    return false
  }

  editable.focus()

  const textNodes = getTextNodes(editable)
  if (textNodes.length === 0) {
    return doc.activeElement === editable || editable.contains(doc.activeElement)
  }

  const range = doc.createRange()
  const firstTextNode = textNodes[0]
  const lastTextNode = textNodes[textNodes.length - 1]
  range.setStart(firstTextNode, 0)
  range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0)

  const selection = doc.getSelection()
  if (!selection) return false

  selection.removeAllRanges()
  selection.addRange(range)
  doc.execCommand?.('selectAll')

  return selection.rangeCount > 0 && selection.toString() === editable.textContent
}

function getTextNodes(node, textNodes = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent) {
      textNodes.push(child)
    } else {
      getTextNodes(child, textNodes)
    }
  }

  return textNodes
}

function getDefaultAnnotationArrowBend(dx, dy, scale) {
  const length = Math.hypot(dx, dy)
  if (length === 0) return 0

  const bend = Math.min(
    Math.max(length * ANNOTATION_BEND_RATIO, ANNOTATION_MIN_BEND * scale),
    ANNOTATION_MAX_BEND * scale
  )

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? -bend : bend
  }

  return bend
}

function getAnnotationColor(editor) {
  const color = editor.getStyleForNextShape(DefaultColorStyle)
  return color === DefaultColorStyle.defaultValue ? ANNOTATION_DEFAULT_COLOR : color
}

class CowartAnnotationTool extends StateNode {
  static id = ANNOTATION_TOOL_ID
  static initial = 'idle'

  static children() {
    return [CowartAnnotationIdle, CowartAnnotationPointing]
  }

  onEnter() {
    unlockGlobalToolLock(this.editor)
  }
}

class CowartAnnotationIdle extends StateNode {
  static id = 'idle'

  onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  onPointerDown(info) {
    this.parent.transition('pointing', info)
  }

  onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class CowartAnnotationPointing extends StateNode {
  static id = 'pointing'

  arrowId = null
  markId = ''
  origin = null

  onEnter() {
    const origin = this.editor.inputs.getOriginPagePoint()
    const scale = this.editor.getResizeScaleFactor()
    const color = getAnnotationColor(this.editor)
    const arrowId = createShapeId()

    this.arrowId = arrowId
    this.origin = { x: origin.x, y: origin.y }
    this.markId = this.editor.markHistoryStoppingPoint(`creating_annotation:${arrowId}`)

    this.editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: origin.x,
      y: origin.y,
      meta: {
        cowartAnnotationArrow: true
      },
      props: {
        kind: 'arc',
        dash: 'draw',
        size: 'm',
        fill: 'none',
        color,
        labelColor: color,
        bend: 0,
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        richText: toRichText(''),
        labelPosition: ANNOTATION_LABEL_POSITION,
        font: 'draw',
        scale
      }
    })
  }

  onPointerMove() {
    this.updateArrowEnd()
  }

  onPointerUp() {
    this.complete()
  }

  onCancel() {
    this.cancel()
  }

  onInterrupt() {
    this.cancel()
  }

  updateArrowEnd() {
    if (!this.arrowId || !this.origin) return

    const point = this.editor.inputs.getCurrentPagePoint()
    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          end: {
            x: point.x - this.origin.x,
            y: point.y - this.origin.y
          }
        }
      }
    ])
  }

  complete() {
    if (!this.arrowId || !this.origin) {
      this.editor.setCurrentTool(ANNOTATION_TOOL_ID)
      return
    }

    this.updateArrowEnd()

    const point = this.editor.inputs.getCurrentPagePoint()
    const dx = point.x - this.origin.x
    const dy = point.y - this.origin.y
    const length = Math.hypot(dx, dy)

    if (length < ANNOTATION_MIN_LENGTH / this.editor.getZoomLevel()) {
      this.editor.bailToMark(this.markId)
      this.parent.transition('idle')
      return
    }

    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          bend: getDefaultAnnotationArrowBend(dx, dy, this.editor.getResizeScaleFactor())
        }
      }
    ])

    startEditingAnnotationArrowLabel(this.editor, this.arrowId)
  }

  cancel() {
    if (this.arrowId) {
      this.editor.bailToMark(this.markId)
    }
    this.parent.transition('idle')
  }
}

class CowartFrameShapeUtil extends FrameShapeUtil {
  isAspectRatioLocked(shape) {
    if (isAiImageHolderShape(shape)) {
      return isAiImageAspectLocked(shape)
    }

    return super.isAspectRatioLocked(shape)
  }
}

const cowartShapeUtils = [CowartFrameShapeUtil]

const cowartUiOverrides = {
  translations: {
    en: {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    },
    'zh-cn': {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.cowart-annotation': ANNOTATION_TOOL_LABEL
    }
  },
  tools(editor, tools) {
    return {
      ...tools,
      arrow: {
        ...tools.arrow,
        kbd: undefined
      },
      [AI_IMAGE_TOOL_ID]: {
        id: AI_IMAGE_TOOL_ID,
        label: 'tool.ai-image',
        icon: 'tool-frame',
        kbd: 'a',
        onSelect() {
          createAiImageHolderAtViewportCenter(editor)
        },
        onDragStart(source, info) {
          const scale = editor.getResizeScaleFactor()
          onDragFromToolbarToCreateShape(editor, info, {
            createShape: (id) =>
              createAiImageHolderShape(editor, id, {
                props: {
                  w: AI_IMAGE_HOLDER_DEFAULT_W * scale,
                  h: AI_IMAGE_HOLDER_DEFAULT_H * scale
                }
              }),
            onDragEnd: (id) => editor.select(id)
          })
        },
        meta: {
          cowartTool: 'ai-image-holder'
        }
      },
      [ANNOTATION_TOOL_ID]: {
        id: ANNOTATION_TOOL_ID,
        label: 'tool.cowart-annotation',
        icon: annotationToolIcon,
        kbd: 'c',
        onSelect() {
          unlockGlobalToolLock(editor)
          editor.setCurrentTool(ANNOTATION_TOOL_ID)
        },
        meta: {
          cowartTool: 'annotation'
        }
      }
    }
  }
}

const cowartComponents = {
  Toolbar: CowartToolbar,
  StylePanel: CowartStylePanel,
  InFrontOfTheCanvas: CowartImageRegionOverlay
}

function CowartStylePanel(props) {
  return (
    <DefaultStylePanel {...props}>
      <DefaultStylePanelContent />
      <CowartAiImageStyleControls />
    </DefaultStylePanel>
  )
}

function CowartAiImageStyleControls() {
  const editor = useEditor()
  const selectedAiImageShape = useValue(
    'selected ai image holder shape',
    () => {
      const selectedShapeIds = editor.getSelectedShapeIds()
      if (selectedShapeIds.length !== 1) return null

      const shape = editor.getShape(selectedShapeIds[0])
      return isAiImageHolderShape(shape) ? shape : null
    },
    [editor]
  )
  const [widthValue, setWidthValue] = useState('')
  const [heightValue, setHeightValue] = useState('')

  useEffect(() => {
    if (!selectedAiImageShape) {
      setWidthValue('')
      setHeightValue('')
      return
    }

    setWidthValue(formatAiImageSize(selectedAiImageShape.props.w))
    setHeightValue(formatAiImageSize(selectedAiImageShape.props.h))
  }, [selectedAiImageShape?.id, selectedAiImageShape?.props.w, selectedAiImageShape?.props.h])

  if (!selectedAiImageShape) return null

  const activePreset = getAiImageAspectPreset(selectedAiImageShape)
  const currentWidth = Number(selectedAiImageShape.props.w)
  const currentHeight = Number(selectedAiImageShape.props.h)
  const currentRatio = currentHeight ? currentWidth / currentHeight : 1
  const isAspectLocked = isAiImageAspectLocked(selectedAiImageShape)

  function updateAiImageSize(nextWidth, nextHeight, historyMark = 'resize-ai-image-holder') {
    const w = clampAiImageSize(nextWidth)
    const h = clampAiImageSize(nextHeight)
    if (!w || !h) return

    editor.markHistoryStoppingPoint(historyMark)
    editor.updateShapes([
      {
        id: selectedAiImageShape.id,
        type: 'frame',
        meta: {
          ...selectedAiImageShape.meta,
          cowartAiAspectRatio: w / h
        },
        props: { w, h }
      }
    ])
  }

  function toggleAspectLock() {
    const nextIsLocked = !isAspectLocked
    editor.markHistoryStoppingPoint('toggle-ai-image-aspect-lock')
    editor.updateShapes([
      {
        id: selectedAiImageShape.id,
        type: 'frame',
        meta: {
          ...selectedAiImageShape.meta,
          cowartAiAspectLocked: nextIsLocked,
          cowartAiAspectRatio: currentRatio
        }
      }
    ])
  }

  function commitWidth(value) {
    const nextWidth = clampAiImageSize(Number(value))
    if (!nextWidth) {
      setWidthValue(formatAiImageSize(currentWidth))
      return
    }

    const nextHeight = isAspectLocked ? Math.round(nextWidth / currentRatio) : currentHeight
    updateAiImageSize(nextWidth, nextHeight)
  }

  function commitHeight(value) {
    const nextHeight = clampAiImageSize(Number(value))
    if (!nextHeight) {
      setHeightValue(formatAiImageSize(currentHeight))
      return
    }

    const nextWidth = isAspectLocked ? Math.round(nextHeight * currentRatio) : currentWidth
    updateAiImageSize(nextWidth, nextHeight)
  }

  function handleNumberKeyDown(event) {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      setWidthValue(formatAiImageSize(currentWidth))
      setHeightValue(formatAiImageSize(currentHeight))
      event.currentTarget.blur()
    }
  }

  return (
    <div className="cowart-ai-image-style-panel" aria-label="AI 图片尺寸设置">
      <section className="cowart-ai-style-section">
        <div className="cowart-ai-style-heading">
          <span>尺寸</span>
        </div>
        <div className="cowart-ai-size-row">
          <label className="cowart-ai-size-field">
            <span>W</span>
            <input
              aria-label="AI 图片宽度"
              inputMode="numeric"
              min={AI_IMAGE_SIZE_MIN}
              max={AI_IMAGE_SIZE_MAX}
              value={widthValue}
              onChange={(event) => setWidthValue(event.target.value)}
              onBlur={(event) => commitWidth(event.target.value)}
              onKeyDown={handleNumberKeyDown}
            />
          </label>
          <button
            aria-label={isAspectLocked ? '解除宽高比例锁定' : '锁定宽高比例'}
            aria-pressed={isAspectLocked}
            className="cowart-ai-aspect-lock"
            onClick={toggleAspectLock}
            type="button"
          >
            <CowartAspectLockIcon locked={isAspectLocked} />
          </button>
          <label className="cowart-ai-size-field">
            <span>H</span>
            <input
              aria-label="AI 图片高度"
              inputMode="numeric"
              min={AI_IMAGE_SIZE_MIN}
              max={AI_IMAGE_SIZE_MAX}
              value={heightValue}
              onChange={(event) => setHeightValue(event.target.value)}
              onBlur={(event) => commitHeight(event.target.value)}
              onKeyDown={handleNumberKeyDown}
            />
          </label>
        </div>
      </section>

      <section className="cowart-ai-style-section">
        <div className="cowart-ai-style-heading">
          <span>比例</span>
        </div>
        <div className="cowart-ai-aspect-grid">
          {AI_IMAGE_ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              aria-pressed={activePreset?.id === preset.id}
              className="cowart-ai-aspect-preset"
              onClick={() =>
                updateAiImageSize(preset.w, preset.h, `resize-ai-image-holder:${preset.id}`)
              }
              type="button"
            >
              <span
                className="cowart-ai-aspect-icon"
                style={getAspectIconStyle(preset)}
              />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function CowartAspectLockIcon({ locked }) {
  if (locked) {
    return (
      <svg
        aria-hidden="true"
        className="cowart-ai-lock-icon"
        viewBox="0 0 20 20"
      >
        <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
        <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className="cowart-ai-lock-icon"
      viewBox="0 0 20 20"
    >
      <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
      <path d="M7 8.5V6.5a3 3 0 0 1 5.8-1.1" />
    </svg>
  )
}

function CowartToolbarItem({ toolId }) {
  const editor = useEditor()
  const isSelected = useValue(
    `is ${toolId} selected`,
    () => editor.getCurrentToolId() === toolId,
    [editor, toolId]
  )

  return <TldrawUiMenuToolItem toolId={toolId} isSelected={isSelected} />
}

function CowartAnnotationToolbarItem() {
  const editor = useEditor()
  const isSelected = useValue(
    'is annotation selected',
    () => editor.getCurrentToolId() === ANNOTATION_TOOL_ID,
    [editor]
  )

  return (
    <button
      aria-label={ANNOTATION_TOOL_LABEL}
      aria-pressed={isSelected ? 'true' : 'false'}
      className="tlui-button tlui-button__tool cowart-annotation-toolbar-button"
      data-testid={`tools.${ANNOTATION_TOOL_ID}`}
      data-value={ANNOTATION_TOOL_ID}
      draggable={false}
      onClick={() => {
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      onTouchStart={(event) => {
        event.preventDefault()
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      title={ANNOTATION_TOOL_LABEL}
      type="button"
    >
      {annotationToolIcon}
      <span className="cowart-annotation-toolbar-label" draggable={false}>
        {ANNOTATION_TOOL_LABEL}
      </span>
    </button>
  )
}

function CowartToolbarDivider() {
  return <div aria-orientation="vertical" className="cowart-toolbar-divider" role="separator" />
}

function CowartToolbar(props) {
  return (
    <DefaultToolbar {...props} maxItems={9}>
      <CowartAnnotationToolbarItem />
      <CowartToolbarDivider />
      <SelectToolbarItem />
      <HandToolbarItem />
      <CowartToolbarItem toolId={AI_IMAGE_TOOL_ID} />
      <CowartToolbarDivider />
      <AssetToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <TextToolbarItem />
      <ArrowToolbarItem />
      <NoteToolbarItem />
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <TriangleToolbarItem />
      <DiamondToolbarItem />
      <HexagonToolbarItem />
      <OvalToolbarItem />
      <RhombusToolbarItem />
      <StarToolbarItem />
      <CloudToolbarItem />
      <HeartToolbarItem />
      <XBoxToolbarItem />
      <CheckBoxToolbarItem />
      <ArrowLeftToolbarItem />
      <ArrowUpToolbarItem />
      <ArrowDownToolbarItem />
      <ArrowRightToolbarItem />
      <LineToolbarItem />
      <HighlightToolbarItem />
      <LaserToolbarItem />
      <FrameToolbarItem />
    </DefaultToolbar>
  )
}

function getRegionViewportOverlay(editor, imageShape, asset) {
  const imageMap = getCowartImageMapFromRecords(imageShape, asset)
  if (!imageMap?.regions?.length) return []

  const width = Number(imageShape.props?.w)
  const height = Number(imageShape.props?.h)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return []
  }

  const transform = editor.getShapePageTransform(imageShape.id)
  const selectedShapeIds = new Set(editor.getSelectedShapeIds())
  return imageMap.regions
    .map((region) => {
      const { x, y, w, h } = region.bbox
      const localPoints = [
        { x: x * width, y: y * height },
        { x: (x + w) * width, y: y * height },
        { x: (x + w) * width, y: (y + h) * height },
        { x: x * width, y: (y + h) * height }
      ]
      const pagePoints = localPoints.map((point) => transform.applyToPoint(point))
      const viewportPoints = pagePoints.map((point) => editor.pageToViewport(point))
      if (!viewportPoints.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
        return null
      }

      const xs = viewportPoints.map((point) => point.x)
      const ys = viewportPoints.map((point) => point.y)
      const left = Math.min(...xs)
      const top = Math.min(...ys)
      const right = Math.max(...xs)
      const bottom = Math.max(...ys)
      const overlayWidth = right - left
      const overlayHeight = bottom - top
      if (overlayWidth < IMAGE_REGION_OVERLAY_MIN_SIZE || overlayHeight < IMAGE_REGION_OVERLAY_MIN_SIZE) {
        return null
      }

      return {
        key: `${imageShape.id}:${region.id}`,
        imageShapeId: imageShape.id,
        assetId: imageShape.props?.assetId ?? null,
        region,
        pagePoints,
        isImageSelected: selectedShapeIds.has(imageShape.id),
        style: {
          left: `${left}px`,
          top: `${top}px`,
          width: `${overlayWidth}px`,
          height: `${overlayHeight}px`
        },
        polygonPoints: viewportPoints
          .map((point) => `${point.x - left},${point.y - top}`)
          .join(' ')
      }
    })
    .filter(Boolean)
}

function getBoundsFromPoints(points) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)

  return {
    x,
    y,
    w: maxX - x,
    h: maxY - y,
    center: {
      x: x + (maxX - x) / 2,
      y: y + (maxY - y) / 2
    }
  }
}

function getQuickAnnotationLabel(region) {
  return region.text ? `${region.label}: ${region.text}` : region.label
}

function createQuickAnnotationForRegion(editor, regionOverlay) {
  const bounds = getBoundsFromPoints(regionOverlay.pagePoints)
  const scale = editor.getResizeScaleFactor()
  const color = getAnnotationColor(editor)
  const arrowId = createShapeId()
  const start = {
    x: bounds.x + bounds.w + QUICK_ANNOTATION_OFFSET_X * scale,
    y: bounds.y - QUICK_ANNOTATION_OFFSET_Y * scale
  }
  const end = bounds.center
  const dx = end.x - start.x
  const dy = end.y - start.y

  editor.markHistoryStoppingPoint(`quick_annotation:${regionOverlay.region.id}`)
  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: start.x,
    y: start.y,
    meta: {
      cowartAnnotationArrow: true,
      cowartQuickAnnotation: true,
      cowartImageRegionSource: {
        imageShapeId: regionOverlay.imageShapeId,
        assetId: regionOverlay.assetId,
        regionId: regionOverlay.region.id
      }
    },
    props: {
      kind: 'arc',
      dash: 'draw',
      size: 'm',
      fill: 'none',
      color,
      labelColor: color,
      bend: getDefaultAnnotationArrowBend(dx, dy, scale),
      start: { x: 0, y: 0 },
      end: { x: dx, y: dy },
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
      richText: toRichText(getQuickAnnotationLabel(regionOverlay.region)),
      labelPosition: ANNOTATION_LABEL_POSITION,
      font: 'draw',
      scale
    }
  })

  startEditingAnnotationArrowLabel(editor, arrowId)
}

function CowartImageRegionOverlay() {
  const editor = useEditor()
  const [hoveredRegionKey, setHoveredRegionKey] = useState(null)
  const [selectedRegionKey, setSelectedRegionKey] = useState(null)
  const regions = useValue(
    'cowart image region overlays',
    () => {
      editor.getCamera()
      return editor
        .getCurrentPageShapes()
        .filter((shape) => shape.type === 'image')
        .flatMap((shape) => {
          const asset = shape.props?.assetId ? editor.getAsset(shape.props.assetId) : null
          return getRegionViewportOverlay(editor, shape, asset)
        })
    },
    [editor]
  )

  if (regions.length === 0) return null

  return (
    <div className="cowart-image-region-overlay-layer">
      {regions.map((regionOverlay) => {
        const isActive =
          regionOverlay.key === selectedRegionKey && regionOverlay.isImageSelected
        const isHovered = regionOverlay.key === hoveredRegionKey
        const label = regionOverlay.region.text
          ? `${regionOverlay.region.label}: ${regionOverlay.region.text}`
          : regionOverlay.region.label

        return (
          <button
            key={regionOverlay.key}
            aria-label={`选择图片区域 ${label}，右键或双击添加标注`}
            className="cowart-image-region-overlay"
            data-cowart-image-region-id={regionOverlay.region.id}
            data-cowart-image-shape-id={regionOverlay.imageShapeId}
            data-state={isActive ? 'selected' : isHovered ? 'hovered' : 'idle'}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              editor.select(regionOverlay.imageShapeId)
              setSelectedRegionKey(regionOverlay.key)
              window.__cowartSelectImageRegion?.({
                imageShapeId: regionOverlay.imageShapeId,
                assetId: regionOverlay.assetId,
                regionId: regionOverlay.region.id,
                region: regionOverlay.region,
                selectedAt: new Date().toISOString()
              })
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              createQuickAnnotationForRegion(editor, regionOverlay)
            }}
            onDoubleClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              createQuickAnnotationForRegion(editor, regionOverlay)
            }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onPointerEnter={() => setHoveredRegionKey(regionOverlay.key)}
            onPointerLeave={() => setHoveredRegionKey((key) => (key === regionOverlay.key ? null : key))}
            style={regionOverlay.style}
            title={label}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="cowart-image-region-overlay-shape"
              preserveAspectRatio="none"
              viewBox={`0 0 ${parseFloat(regionOverlay.style.width)} ${parseFloat(regionOverlay.style.height)}`}
            >
              <polygon points={regionOverlay.polygonPoints} />
            </svg>
            <span className="cowart-image-region-overlay-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function getCowartSelection(editor) {
  const selectedShapeIds = editor.getSelectedShapeIds()
  return selectedShapeIds.map((id) => {
    const shape = editor.getShape(id)
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
    const imageMap = shape?.type === 'image' ? getCowartImageMapFromRecords(shape, asset) : null
    return {
      id,
      type: shape?.type ?? null,
      parentId: shape?.parentId ?? null,
      x: shape?.x ?? null,
      y: shape?.y ?? null,
      rotation: shape?.rotation ?? null,
      meta: shape?.meta ?? null,
      isAiImageHolder: shape?.meta?.cowartAiImageHolder === true,
      props: shape?.props ?? null,
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            name: asset.props?.name ?? null,
            src: asset.props?.src ?? null,
            w: asset.props?.w ?? null,
            h: asset.props?.h ?? null,
            mimeType: asset.props?.mimeType ?? null,
            fileSize: asset.props?.fileSize ?? null
          }
        : null,
      imageMap: imageMap
        ? {
            version: imageMap.version,
            regionCount: imageMap.regions.length
          }
        : null
    }
  })
}

function getValidSelectedImageRegion(editor, selectedShapes, selectedImageRegion) {
  if (!selectedImageRegion || typeof selectedImageRegion !== 'object') return null
  if (!selectedShapes.some((shape) => shape.id === selectedImageRegion.imageShapeId)) return null

  const imageShape = editor.getShape(selectedImageRegion.imageShapeId)
  if (!imageShape || imageShape.type !== 'image') return null

  const asset = imageShape.props?.assetId ? editor.getAsset(imageShape.props.assetId) : null
  const imageMap = getCowartImageMapFromRecords(imageShape, asset)
  const region = findCowartImageMapRegion(imageMap, selectedImageRegion.regionId)
  if (!region) return null

  return {
    imageShapeId: imageShape.id,
    assetId: imageShape.props?.assetId ?? selectedImageRegion.assetId ?? null,
    regionId: region.id,
    region,
    selectedAt: selectedImageRegion.selectedAt ?? new Date().toISOString()
  }
}

function getCowartSelectionSnapshot(editor, selectedImageRegion = null) {
  const selectedShapes = getCowartSelection(editor)
  const validSelectedImageRegion = getValidSelectedImageRegion(
    editor,
    selectedShapes,
    selectedImageRegion
  )

  return {
    selectedShapes,
    selectedImageRegion: validSelectedImageRegion
  }
}

function getCowartViewState(editor) {
  const camera = editor.getCamera()
  return {
    version: 1,
    currentPageId: editor.getCurrentPageId(),
    camera: {
      x: camera.x,
      y: camera.y,
      z: camera.z
    }
  }
}

function isRestorableViewState(viewState) {
  return (
    viewState &&
    typeof viewState === 'object' &&
    typeof viewState.currentPageId === 'string' &&
    viewState.camera &&
    Number.isFinite(viewState.camera.x) &&
    Number.isFinite(viewState.camera.y) &&
    Number.isFinite(viewState.camera.z)
  )
}

function restoreCowartViewState(editor, viewState) {
  if (!isRestorableViewState(viewState)) return
  if (!editor.getPage(viewState.currentPageId)) return

  editor.setCurrentPage(viewState.currentPageId)
  editor.setCamera(viewState.camera, { immediate: true, force: true })
}

function writeCowartSelectionState(selectionSnapshot) {
  let stateElement = document.getElementById(SELECTION_STATE_ELEMENT_ID)
  if (!stateElement) {
    stateElement = document.createElement('script')
    stateElement.id = SELECTION_STATE_ELEMENT_ID
    stateElement.type = 'application/json'
    document.body.append(stateElement)
  }

  stateElement.textContent = JSON.stringify({
    ...selectionSnapshot,
    updatedAt: new Date().toISOString()
  })
}

export default function App() {
  const [snapshot, setSnapshot] = useState()
  const [viewState, setViewState] = useState()
  const [loadError, setLoadError] = useState(null)
  const [skippedRecords, setSkippedRecords] = useState([])
  const selectedImageRegionRef = useRef(null)
  const syncSelectionStateRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCanvas() {
      try {
        const [canvasResponse, viewStateResponse] = await Promise.all([
          fetch(CANVAS_ENDPOINT, { signal: controller.signal }),
          fetch(VIEW_STATE_ENDPOINT, { signal: controller.signal })
        ])
        if (!canvasResponse.ok) {
          throw new Error(`Failed to load canvas: ${canvasResponse.status}`)
        }
        if (!viewStateResponse.ok) {
          throw new Error(`Failed to load canvas view state: ${viewStateResponse.status}`)
        }
        const [canvasData, viewStateData] = await Promise.all([
          canvasResponse.json(),
          viewStateResponse.json()
        ])
        const sanitized = sanitizeCanvasSnapshotForTldraw(canvasData.snapshot)
        setSnapshot(sanitized.snapshot)
        setSkippedRecords(sanitized.skippedRecords)
        setViewState(viewStateData.viewState ?? null)
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(error)
        setSnapshot(null)
        setViewState(null)
      }
    }

    loadCanvas()

    return () => controller.abort()
  }, [])

  const handleMount = useCallback((editor) => {
    window.__cowartEditor = editor
    window.__cowartSelection = () =>
      getCowartSelectionSnapshot(editor, selectedImageRegionRef.current)
    window.__cowartViewState = () => getCowartViewState(editor)
    window.__cowartSelectImageRegion = (selectedImageRegion) => {
      selectedImageRegionRef.current = selectedImageRegion
      syncSelectionStateRef.current?.()
    }
    let lastSyncedSelectionState = ''
    let isSelectionStateSaving = false
    let hasPendingSelectionState = false
    let lastSyncedViewState = ''
    let isViewStateSaving = false
    let hasPendingViewState = false

    editor.timers.requestAnimationFrame(() => {
      restoreCowartViewState(editor, viewState)
    })

    async function syncSelectionState() {
      const selectionSnapshot = getCowartSelectionSnapshot(
        editor,
        selectedImageRegionRef.current
      )
      if (!selectionSnapshot.selectedImageRegion && selectedImageRegionRef.current) {
        selectedImageRegionRef.current = null
      }
      writeCowartSelectionState(selectionSnapshot)

      const selectionState = JSON.stringify(selectionSnapshot)
      if (selectionState === lastSyncedSelectionState) return
      lastSyncedSelectionState = selectionState

      if (isSelectionStateSaving) {
        hasPendingSelectionState = true
        return
      }

      isSelectionStateSaving = true
      try {
        const response = await fetch(SELECTION_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...selectionSnapshot,
            updatedAt: new Date().toISOString()
          })
        })
        if (!response.ok) {
          throw new Error(`Failed to save selection: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isSelectionStateSaving = false
        if (hasPendingSelectionState) {
          hasPendingSelectionState = false
          syncSelectionState()
        }
      }
    }

    syncSelectionStateRef.current = syncSelectionState
    syncSelectionState()
    const selectionStateTimer = window.setInterval(syncSelectionState, 250)

    async function syncViewState() {
      const viewStateSnapshot = {
        ...getCowartViewState(editor),
        updatedAt: new Date().toISOString()
      }

      const nextViewState = JSON.stringify(viewStateSnapshot)
      if (nextViewState === lastSyncedViewState) return
      lastSyncedViewState = nextViewState

      if (isViewStateSaving) {
        hasPendingViewState = true
        return
      }

      isViewStateSaving = true
      try {
        const response = await fetch(VIEW_STATE_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: nextViewState
        })
        if (!response.ok) {
          throw new Error(`Failed to save view state: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isViewStateSaving = false
        if (hasPendingViewState) {
          hasPendingViewState = false
          syncViewState()
        }
      }
    }

    const viewStateTimer = window.setInterval(syncViewState, 500)
    editor.timers.setTimeout(syncViewState, 100)

    let saveTimer = null
    let isSaving = false
    let hasPendingSave = false
    let hasUnsavedChanges = false
    let isSyncingAnnotationShape = false
    let remoteLoadController = null

    async function saveCanvas() {
      if (!hasUnsavedChanges) return

      if (isSaving) {
        hasPendingSave = true
        return
      }

      isSaving = true
      try {
        const body = JSON.stringify(editor.store.getStoreSnapshot())
        const response = await fetch(CANVAS_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body
        })
        if (!response.ok) {
          throw new Error(`Failed to save canvas: ${response.status}`)
        }
        hasUnsavedChanges = false
      } catch (error) {
        console.error(error)
      } finally {
        isSaving = false
        if (hasPendingSave) {
          hasPendingSave = false
          scheduleSave()
        }
      }
    }

    function scheduleSave() {
      hasUnsavedChanges = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(saveCanvas, 500)
    }

    async function loadRemoteCanvasSnapshot() {
      remoteLoadController?.abort()
      const controller = new AbortController()
      remoteLoadController = controller

      const preserveLocalChanges = hasUnsavedChanges || isSaving
      const preFetchStore = preserveLocalChanges ? null : editor.store.getStoreSnapshot().store

      try {
        const response = await fetch(CANVAS_ENDPOINT, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to refresh canvas: ${response.status}`)
        }

        const canvasData = await response.json()
        const effectivePreserve =
          preserveLocalChanges || (preFetchStore && storeChangedSinceSnapshot(editor, preFetchStore))
        const { changedRecords, skippedRecords: nextSkippedRecords } = applyRemoteCanvasSnapshot(
          editor,
          canvasData.snapshot,
          {
            preserveLocalChanges: effectivePreserve
          }
        )
        setSkippedRecords(nextSkippedRecords)

        if (changedRecords > 0 && effectivePreserve) {
          hasUnsavedChanges = true
          if (isSaving) {
            hasPendingSave = true
          } else {
            scheduleSave()
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error(error)
      } finally {
        if (remoteLoadController === controller) {
          remoteLoadController = null
        }
      }
    }

    const unsubscribe = editor.store.listen(scheduleSave, {
      source: 'user',
      scope: 'document'
    })

    let canvasEvents = null
    if ('EventSource' in window) {
      canvasEvents = new EventSource(CANVAS_EVENTS_ENDPOINT)
      canvasEvents.addEventListener('canvas-changed', loadRemoteCanvasSnapshot)
      canvasEvents.onerror = (error) => {
        console.warn('Cowart canvas live refresh disconnected.', error)
      }
    }

    const unsubscribeAnnotationEditingToolLock = editor.store.listen(
      ({ changes }) => {
        for (const [previous, next] of Object.values(changes.updated)) {
          if (previous?.typeName !== 'instance_page_state') continue
          if (!previous.editingShapeId || next.editingShapeId) continue

          const shape = editor.getShape(previous.editingShapeId)
          if (shape?.meta?.cowartAnnotationArrow !== true) continue

          editor.timers.requestAnimationFrame(() => {
            if (editor.getEditingShapeId()) return
            if (editor.getCurrentToolId() !== 'select') return
            editor.setCurrentTool(ANNOTATION_TOOL_ID)
          })
        }
      },
      {
        source: 'all',
        scope: 'session'
      }
    )

    const unsubscribeAnnotationShapeSync = editor.store.listen(
      ({ changes }) => {
        if (isSyncingAnnotationShape) return

        const updates = []
        for (const [_previous, next] of Object.values(changes.updated)) {
          if (next?.typeName !== 'shape') continue
          if (next.type !== 'arrow') continue
          if (next.meta?.cowartAnnotationArrow !== true) continue

          const props = {}
          if (next.props?.color !== next.props?.labelColor) {
            props.labelColor = next.props.color
          }
          if (next.props?.labelPosition !== ANNOTATION_LABEL_POSITION) {
            props.labelPosition = ANNOTATION_LABEL_POSITION
          }

          if (Object.keys(props).length === 0) continue

          updates.push({
            id: next.id,
            type: 'arrow',
            props
          })
        }

        if (updates.length === 0) return

        isSyncingAnnotationShape = true
        try {
          editor.updateShapes(updates)
        } finally {
          isSyncingAnnotationShape = false
        }
      },
      {
        source: 'all',
        scope: 'document'
      }
    )

    return () => {
      window.clearTimeout(saveTimer)
      window.clearInterval(selectionStateTimer)
      window.clearInterval(viewStateTimer)
      remoteLoadController?.abort()
      canvasEvents?.close()
      if (window.__cowartEditor === editor) {
        delete window.__cowartEditor
        delete window.__cowartSelection
        delete window.__cowartViewState
        delete window.__cowartSelectImageRegion
      }
      if (syncSelectionStateRef.current === syncSelectionState) {
        syncSelectionStateRef.current = null
      }
      document.getElementById(SELECTION_STATE_ELEMENT_ID)?.remove()
      unsubscribe()
      unsubscribeAnnotationEditingToolLock()
      unsubscribeAnnotationShapeSync()
      syncViewState()
      saveCanvas()
    }
  }, [viewState])

  if (snapshot === undefined || viewState === undefined) {
    return (
      <main className="cowart-status" aria-live="polite">
        Loading canvas...
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="cowart-status" aria-live="polite">
        Canvas file could not be loaded.
      </main>
    )
  }

  return (
    <main className="cowart-canvas" aria-label="Cowart infinite canvas">
      <SkippedRecordsNotice records={skippedRecords} />
      <Tldraw
        snapshot={snapshot ?? undefined}
        inferDarkMode
        onMount={handleMount}
        overrides={cowartUiOverrides}
        components={cowartComponents}
        shapeUtils={cowartShapeUtils}
        tools={[CowartAnnotationTool]}
      />
    </main>
  )
}

function SkippedRecordsNotice({ records }) {
  if (!records.length) return null

  return (
    <aside className="cowart-skipped-records" aria-live="polite">
      <strong>Skipped {records.length} invalid canvas record{records.length === 1 ? '' : 's'}.</strong>
      <span>Valid content was loaded.</span>
      <details>
        <summary>Details</summary>
        <ul>
          {records.slice(0, 8).map((record, index) => (
            <li key={`${record.id}:${index}`}>
              <code>{record.id}</code>
              {record.typeName ? ` ${record.typeName}` : ''}
              {record.type ? `/${record.type}` : ''}: {record.reason}
            </li>
          ))}
        </ul>
      </details>
    </aside>
  )
}
