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
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
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
  createShapeId,
  onDragFromToolbarToCreateShape,
  startEditingShapeWithRichText,
  toRichText,
  useEditor,
  useValue
} from 'tldraw'
import { AllSelection } from '@tiptap/pm/state'
import 'tldraw/tldraw.css'
import { useCallback, useEffect, useState } from 'react'
import annotationToolIconRaw from './assets/tool-comment.svg?raw'

const CANVAS_ENDPOINT = '/api/canvas'
const CANVAS_EVENTS_ENDPOINT = '/api/canvas-events'
const SELECTION_ENDPOINT = '/api/selection'
const VIEW_STATE_ENDPOINT = '/api/view-state'
const SELECTION_STATE_ELEMENT_ID = 'cowart-selection-state'
const AI_IMAGE_TOOL_ID = 'ai-image'
const AI_IMAGE_HOLDER_LABEL = 'AI 图片'
const AI_IMAGE_HOLDER_DEFAULT_W = 320
const AI_IMAGE_HOLDER_DEFAULT_H = 220
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
  if (!isCanvasSnapshot(snapshot)) return 0

  const migratedSnapshot = editor.store.migrateSnapshot(snapshot)
  const recordsToPut = Object.values(migratedSnapshot.store).filter((record) => {
    const localRecord = editor.store.get(record.id)
    if (!localRecord) return true
    if (preserveLocalChanges) return false
    return !recordsAreEqual(localRecord, record)
  })

  if (recordsToPut.length === 0) return 0

  editor.store.mergeRemoteChanges(() => {
    editor.store.put(recordsToPut)
  })

  return recordsToPut.length
}

function getAiImageHolderMeta() {
  return {
    cowartAiImageHolder: true,
    cowartAiImageHolderVersion: 1
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

function canvasIsEmpty(editor) {
  return !Object.values(editor.store.getStoreSnapshot().store).some(
    (record) => record?.typeName === 'shape'
  )
}

function createInitialAiImageHolderForEmptyCanvas(editor) {
  if (!canvasIsEmpty(editor)) return
  createAiImageHolderAtViewportCenter(editor)
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
  Toolbar: CowartToolbar
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

function getCowartSelection(editor) {
  const selectedShapeIds = editor.getSelectedShapeIds()
  return selectedShapeIds.map((id) => {
    const shape = editor.getShape(id)
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
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
        : null
    }
  })
}

function getCowartSelectionSnapshot(editor) {
  return {
    selectedShapes: getCowartSelection(editor)
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
        setSnapshot(canvasData.snapshot ?? null)
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
    window.__cowartSelection = () => getCowartSelection(editor)
    window.__cowartViewState = () => getCowartViewState(editor)
    let lastSyncedSelectionState = ''
    let isSelectionStateSaving = false
    let hasPendingSelectionState = false
    let lastSyncedViewState = ''
    let isViewStateSaving = false
    let hasPendingViewState = false

    editor.timers.requestAnimationFrame(() => {
      restoreCowartViewState(editor, viewState)
      createInitialAiImageHolderForEmptyCanvas(editor)
    })

    async function syncSelectionState() {
      const selectionSnapshot = getCowartSelectionSnapshot(editor)
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
        const changedRecords = applyRemoteCanvasSnapshot(editor, canvasData.snapshot, {
          preserveLocalChanges: effectivePreserve
        })

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
      <Tldraw
        snapshot={snapshot ?? undefined}
        inferDarkMode
        onMount={handleMount}
        overrides={cowartUiOverrides}
        components={cowartComponents}
        tools={[CowartAnnotationTool]}
      />
    </main>
  )
}
