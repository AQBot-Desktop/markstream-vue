import type { Brush, Drauu, DrawingMode } from 'drauu'
import type { Ref } from 'vue'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import { createDrauu } from 'drauu'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

type AnnotationTool = 'select' | 'pen' | 'arrow' | 'rect' | 'ellipse' | 'text'
type DrawAnnotationKind = 'pen' | 'arrow' | 'rect' | 'ellipse'
type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw'
type AnnotationAlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export interface TextAnnotation {
  id: string
  x: number
  y: number
  content: string
  color: string
  fontSize: number
}
export interface AnnotationSnapshot {
  drawSvg: string
  texts: TextAnnotation[]
}
interface PersistedAnnotationCache {
  content: string
  snapshot: AnnotationSnapshot
}
interface AnnotationSelectionBox {
  x: number
  y: number
  width: number
  height: number
}
interface AnnotationSelectionTarget {
  kind: 'draw' | 'text'
  id: string
  shape?: DrawAnnotationKind
}
interface AnnotationArrowSelectionLine {
  x1: number
  y1: number
  x2: number
  y2: number
}
interface AnnotationTextTransformState {
  x: number
  y: number
  fontSize: number
}
interface AnnotationTextDraft {
  id?: string
  x: number
  y: number
  content: string
  color?: string
  fontSize?: number
}
type DrawAnnotationGeometry
  = | { kind: 'rect', x: number, y: number, width: number, height: number }
    | { kind: 'ellipse', cx: number, cy: number, rx: number, ry: number }
    | { kind: 'arrow', x1: number, y1: number, x2: number, y2: number }
interface AnnotationSelectionTransformState {
  target: AnnotationSelectionTarget
  targets: AnnotationSelectionTarget[]
  pointerId: number
  mode: 'move' | 'resize' | 'arrow-start' | 'arrow-end'
  startX: number
  startY: number
  originBox: AnnotationSelectionBox
  handle?: ResizeHandle
  drawGeometry?: DrawAnnotationGeometry
  drawStates?: Record<string, DrawAnnotationGeometry>
  textState?: AnnotationTextTransformState
  textStates?: Record<string, AnnotationTextTransformState>
  duplicateOnMove?: boolean
  moved: boolean
}

interface UseTestPageAnnotationsOptions {
  input: Ref<string>
  isDark: Ref<boolean>
  showPreviewAnnotations: Readonly<Ref<boolean>>
  getActiveShareStorageKey?: () => string | null
}

const ANNOTATION_CACHE_STORAGE_KEY = 'vmr-test-annotation-cache:v1'
const ANNOTATION_TEXT_EDITOR_WIDTH = 220
const ANNOTATION_TEXT_PLACEMENT_SUPPRESS_MS = 320
const ANNOTATION_DUPLICATE_OFFSET = 24
const ANNOTATION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'] as const
const ANNOTATION_STROKES = [
  { label: '细', value: 3 },
  { label: '中', value: 6 },
  { label: '粗', value: 10 },
] as const
const ANNOTATION_RESIZE_HANDLES = ['nw', 'ne', 'se', 'sw'] as const satisfies ReadonlyArray<ResizeHandle>
const ANNOTATION_TOOL_OPTIONS = [
  { id: 'select', label: 'Cursor' },
  { id: 'pen', label: '画笔' },
  { id: 'arrow', label: '箭头' },
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '椭圆' },
  { id: 'text', label: '文字' },
] as const satisfies ReadonlyArray<{ id: AnnotationTool, label: string }>
const ANNOTATION_ALIGN_OPTIONS = [
  { id: 'left', label: '左对齐', shortLabel: '左齐' },
  { id: 'hcenter', label: '水平居中', shortLabel: '横中' },
  { id: 'right', label: '右对齐', shortLabel: '右齐' },
  { id: 'top', label: '顶对齐', shortLabel: '顶齐' },
  { id: 'vcenter', label: '垂直居中', shortLabel: '竖中' },
  { id: 'bottom', label: '底对齐', shortLabel: '底齐' },
] as const satisfies ReadonlyArray<{ id: AnnotationAlignMode, label: string, shortLabel: string }>
const ANNOTATION_SHORTCUT_HINT = 'Shift+A 标注 / V Cursor'

export function useTestPageAnnotations(options: UseTestPageAnnotationsOptions) {
  const { input, isDark, showPreviewAnnotations, getActiveShareStorageKey } = options

  const previewStageRef = ref<HTMLElement | null>(null)
  const annotationDrawSvgRef = ref<SVGSVGElement | null>(null)
  const annotationTextInputRef = ref<HTMLTextAreaElement | null>(null)
  const annotationEnabled = ref(false)
  const annotationTool = ref<AnnotationTool>('pen')
  const annotationColor = ref<string>(ANNOTATION_COLORS[0])
  const annotationStrokeWidth = ref<number>(ANNOTATION_STROKES[1].value)
  const annotationStageWidth = ref(0)
  const annotationStageHeight = ref(0)
  const annotationTextItems = ref<TextAnnotation[]>([])
  const annotationTextDraft = ref<AnnotationTextDraft | null>(null)
  const annotationHistory = ref<AnnotationSnapshot[]>([{ drawSvg: '', texts: [] }])
  const annotationHistoryIndex = ref(0)
  const isApplyingAnnotationHistory = ref(false)
  const annotationSelectedTargets = ref<AnnotationSelectionTarget[]>([])
  const annotationSelection = ref<AnnotationSelectionTarget | null>(null)
  const annotationSelectionBox = ref<AnnotationSelectionBox | null>(null)
  const annotationArrowSelectionLine = ref<AnnotationArrowSelectionLine | null>(null)
  const annotationSelectionTransform = ref<AnnotationSelectionTransformState | null>(null)
  const annotationIgnoreTextPlacementUntil = ref(0)
  let annotationDrauu: Drauu | null = null
  let preserveAnnotationsOnNextInputChange = false
  let annotationsInitialized = false

  const annotationCanUndo = computed(() => annotationHistoryIndex.value > 0)
  const annotationCanRedo = computed(() => annotationHistoryIndex.value < annotationHistory.value.length - 1)
  const annotationFontSize = computed(() => annotationStrokeWidth.value * 4 + 12)
  const annotationTextOutline = computed(() => isDark.value ? 'rgba(2, 6, 23, 0.76)' : 'rgba(255, 255, 255, 0.92)')
  const annotationHasDrawings = computed(() => {
    const snapshot = annotationHistory.value[annotationHistoryIndex.value]
    return Boolean(snapshot?.drawSvg?.trim())
  })
  const annotationHasItems = computed(() => annotationHasDrawings.value || annotationTextItems.value.length > 0)
  const annotationOverlayVisible = computed(() => showPreviewAnnotations.value)
  const annotationDrawInteractive = computed(() =>
    annotationEnabled.value
    && showPreviewAnnotations.value
    && annotationTool.value !== 'text'
    && annotationTool.value !== 'select',
  )
  const annotationDrawSelectable = computed(() => annotationEnabled.value && showPreviewAnnotations.value && annotationTool.value === 'select')
  const annotationTextInteractive = computed(() => annotationEnabled.value && showPreviewAnnotations.value && annotationTool.value === 'text')
  const annotationTextLayerInteractive = computed(() => annotationEnabled.value && showPreviewAnnotations.value && annotationTool.value === 'select')
  const annotationSelectionVisible = computed(() => Boolean(
    annotationEnabled.value
    && showPreviewAnnotations.value
    && annotationTool.value === 'select'
    && annotationSelectedTargets.value.length
    && annotationSelectionBox.value,
  ))
  const annotationSingleArrowSelection = computed(() =>
    annotationSelectedTargets.value.length === 1
    && annotationSelection.value?.kind === 'draw'
    && annotationSelection.value.shape === 'arrow',
  )
  const annotationSelectionCanResize = computed(() => {
    return annotationSelectedTargets.value.length > 0 && !annotationSingleArrowSelection.value
  })
  const annotationArrowSelectionStyle = computed(() => {
    const arrow = annotationArrowSelectionLine.value
    if (!arrow)
      return undefined

    const dx = arrow.x2 - arrow.x1
    const dy = arrow.y2 - arrow.y1
    const length = Math.max(1, Math.sqrt(dx ** 2 + dy ** 2))
    const angle = Math.atan2(dy, dx) * 180 / Math.PI

    return {
      left: `${arrow.x1}px`,
      top: `${arrow.y1}px`,
      width: `${length}px`,
      transform: `rotate(${angle}deg)`,
    }
  })
  const annotationSelectionActionsVisible = computed(() =>
    annotationSelectionVisible.value && annotationSelectedTargets.value.length > 0,
  )
  const annotationCanAlign = computed(() =>
    annotationSelectedTargets.value.length > 1 && Boolean(annotationSelectionBox.value),
  )

  function normalizeAnnotationSnapshot(snapshot: AnnotationSnapshot | null | undefined) {
    if (!snapshot)
      return null

    return {
      drawSvg: typeof snapshot.drawSvg === 'string' ? snapshot.drawSvg : '',
      texts: Array.isArray(snapshot.texts)
        ? snapshot.texts
            .filter(item => item && typeof item.id === 'string' && typeof item.content === 'string')
            .map(item => ({
              id: item.id,
              x: Number(item.x ?? 0),
              y: Number(item.y ?? 0),
              content: item.content,
              color: typeof item.color === 'string' ? item.color : ANNOTATION_COLORS[0],
              fontSize: Number(item.fontSize ?? annotationFontSize.value),
            }))
        : [],
    } satisfies AnnotationSnapshot
  }

  function cloneTextAnnotations(texts = annotationTextItems.value): TextAnnotation[] {
    return texts.map(text => ({ ...text }))
  }

  function createAnnotationId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  }

  function annotationSelectionKey(target: AnnotationSelectionTarget) {
    return `${target.kind}:${target.id}`
  }

  function isSameAnnotationTarget(a: AnnotationSelectionTarget | null | undefined, b: AnnotationSelectionTarget | null | undefined) {
    if (!a || !b)
      return false

    return a.kind === b.kind && a.id === b.id
  }

  function cloneSelectionTargets(targets = annotationSelectedTargets.value) {
    return targets.map(target => ({ ...target }))
  }

  function areSameAnnotationTargetList(a: AnnotationSelectionTarget[], b: AnnotationSelectionTarget[]) {
    return a.length === b.length && a.every((target, index) => isSameAnnotationTarget(target, b[index]))
  }

  function isAnnotationTargetSelected(target: AnnotationSelectionTarget) {
    return annotationSelectedTargets.value.some(item => isSameAnnotationTarget(item, target))
  }

  function setAnnotationSelections(targets: AnnotationSelectionTarget[], primaryTarget?: AnnotationSelectionTarget | null) {
    const nextTargets = cloneSelectionTargets(targets)
    const nextPrimary = primaryTarget
      ? { ...primaryTarget }
      : nextTargets.at(-1) ?? null

    if (!areSameAnnotationTargetList(annotationSelectedTargets.value, nextTargets))
      annotationSelectedTargets.value = nextTargets

    if (!isSameAnnotationTarget(annotationSelection.value, nextPrimary))
      annotationSelection.value = nextPrimary
  }

  function isMultiSelectionEvent(event: PointerEvent | KeyboardEvent) {
    return event.shiftKey || event.metaKey || event.ctrlKey
  }

  function getStagePointerPosition(event: PointerEvent) {
    const stage = previewStageRef.value
    if (!stage)
      return null

    const rect = stage.getBoundingClientRect()
    return clampPointToStage(event.clientX - rect.left, event.clientY - rect.top)
  }

  function getAnnotationDrawNodes() {
    const drawSvg = annotationDrawSvgRef.value
    if (!drawSvg)
      return [] as SVGElement[]

    return Array.from(drawSvg.children).filter((node): node is SVGElement => node instanceof SVGElement)
  }

  function inferDrawAnnotationKind(node: SVGElement): DrawAnnotationKind {
    const cachedKind = node.dataset.annotationKind as DrawAnnotationKind | undefined
    if (cachedKind)
      return cachedKind

    const tag = node.tagName.toLowerCase()
    if (tag === 'rect')
      return 'rect'
    if (tag === 'ellipse')
      return 'ellipse'
    if (tag === 'line')
      return 'arrow'
    if (tag === 'g' && node.querySelector('line'))
      return 'arrow'
    return 'pen'
  }

  function isSelectableDrawAnnotationKind(kind: DrawAnnotationKind) {
    return kind !== 'pen'
  }

  function applyDrawNodeMetadata(node: SVGElement, kind?: DrawAnnotationKind) {
    node.dataset.annotationId ||= createAnnotationId()
    node.dataset.annotationKind = kind ?? inferDrawAnnotationKind(node)
  }

  function syncAnnotationDrawNodeIds() {
    getAnnotationDrawNodes().forEach((node) => {
      applyDrawNodeMetadata(node)
    })
  }

  function getAnnotationDrawNodeById(id: string) {
    return getAnnotationDrawNodes().find(node => node.dataset.annotationId === id) ?? null
  }

  function getAnnotationTextById(id: string) {
    return annotationTextItems.value.find(text => text.id === id) ?? null
  }

  function getAnnotationTextElementById(id: string) {
    return previewStageRef.value?.querySelector<SVGGraphicsElement>(`.preview-annotation-text-item[data-annotation-id="${id}"]`) ?? null
  }

  function getSvgElementBox(element: SVGGraphicsElement): AnnotationSelectionBox | null {
    try {
      const box = element.getBBox()
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
    }
    catch {
      return null
    }
  }

  function parseSvgNumber(element: Element, name: string) {
    return Number(element.getAttribute(name) ?? 0)
  }

  function getArrowLineElement(node: SVGElement) {
    if (node.tagName.toLowerCase() === 'line')
      return node as SVGLineElement

    return node.querySelector('line')
  }

  function getDrawAnnotationGeometry(target: AnnotationSelectionTarget) {
    if (target.kind !== 'draw' || !target.shape)
      return null

    const node = getAnnotationDrawNodeById(target.id)
    if (!node)
      return null

    if (target.shape === 'rect') {
      return {
        kind: 'rect',
        x: parseSvgNumber(node, 'x'),
        y: parseSvgNumber(node, 'y'),
        width: parseSvgNumber(node, 'width'),
        height: parseSvgNumber(node, 'height'),
      } as const
    }

    if (target.shape === 'ellipse') {
      return {
        kind: 'ellipse',
        cx: parseSvgNumber(node, 'cx'),
        cy: parseSvgNumber(node, 'cy'),
        rx: parseSvgNumber(node, 'rx'),
        ry: parseSvgNumber(node, 'ry'),
      } as const
    }

    if (target.shape === 'arrow') {
      const line = getArrowLineElement(node)
      if (!line)
        return null

      return {
        kind: 'arrow',
        x1: parseSvgNumber(line, 'x1'),
        y1: parseSvgNumber(line, 'y1'),
        x2: parseSvgNumber(line, 'x2'),
        y2: parseSvgNumber(line, 'y2'),
      } as const
    }

    return null
  }

  function applyDrawAnnotationGeometry(target: AnnotationSelectionTarget, geometry: DrawAnnotationGeometry) {
    if (target.kind !== 'draw')
      return false

    const node = getAnnotationDrawNodeById(target.id)
    if (!node)
      return false

    return applyDrawGeometryToNode(node, geometry)
  }

  function applyDrawGeometryToNode(node: SVGElement, geometry: DrawAnnotationGeometry) {
    if (geometry.kind === 'rect') {
      node.setAttribute('x', geometry.x.toFixed(2))
      node.setAttribute('y', geometry.y.toFixed(2))
      node.setAttribute('width', geometry.width.toFixed(2))
      node.setAttribute('height', geometry.height.toFixed(2))
      return true
    }

    if (geometry.kind === 'ellipse') {
      node.setAttribute('cx', geometry.cx.toFixed(2))
      node.setAttribute('cy', geometry.cy.toFixed(2))
      node.setAttribute('rx', geometry.rx.toFixed(2))
      node.setAttribute('ry', geometry.ry.toFixed(2))
      return true
    }

    const line = getArrowLineElement(node)
    if (!line)
      return false

    line.setAttribute('x1', geometry.x1.toFixed(2))
    line.setAttribute('y1', geometry.y1.toFixed(2))
    line.setAttribute('x2', geometry.x2.toFixed(2))
    line.setAttribute('y2', geometry.y2.toFixed(2))
    return true
  }

  function offsetDrawGeometry(geometry: DrawAnnotationGeometry, dx: number, dy: number): DrawAnnotationGeometry {
    if (geometry.kind === 'rect')
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy }
    if (geometry.kind === 'ellipse')
      return { ...geometry, cx: geometry.cx + dx, cy: geometry.cy + dy }
    return {
      ...geometry,
      x1: geometry.x1 + dx,
      y1: geometry.y1 + dy,
      x2: geometry.x2 + dx,
      y2: geometry.y2 + dy,
    }
  }

  function getGeometryBox(geometry: DrawAnnotationGeometry) {
    if (geometry.kind === 'rect')
      return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }
    if (geometry.kind === 'ellipse')
      return { x: geometry.cx - geometry.rx, y: geometry.cy - geometry.ry, width: geometry.rx * 2, height: geometry.ry * 2 }
    return boxFromArrowGeometry(geometry)
  }

  function transformDrawGeometryBySelectionBox(geometry: DrawAnnotationGeometry, originBox: AnnotationSelectionBox, nextBox: AnnotationSelectionBox) {
    const scaleX = nextBox.width / Math.max(originBox.width, 1)
    const scaleY = nextBox.height / Math.max(originBox.height, 1)
    const geometryBox = getGeometryBox(geometry)
    const nextGeometryBox = {
      x: nextBox.x + (geometryBox.x - originBox.x) * scaleX,
      y: nextBox.y + (geometryBox.y - originBox.y) * scaleY,
      width: geometryBox.width * scaleX,
      height: geometryBox.height * scaleY,
    }

    if (geometry.kind === 'rect')
      return { kind: 'rect', ...nextGeometryBox } as const

    if (geometry.kind === 'ellipse') {
      return {
        kind: 'ellipse',
        cx: nextGeometryBox.x + nextGeometryBox.width / 2,
        cy: nextGeometryBox.y + nextGeometryBox.height / 2,
        rx: nextGeometryBox.width / 2,
        ry: nextGeometryBox.height / 2,
      } as const
    }

    return {
      kind: 'arrow',
      x1: nextBox.x + (geometry.x1 - originBox.x) * scaleX,
      y1: nextBox.y + (geometry.y1 - originBox.y) * scaleY,
      x2: nextBox.x + (geometry.x2 - originBox.x) * scaleX,
      y2: nextBox.y + (geometry.y2 - originBox.y) * scaleY,
    } as const
  }

  function clampPointToStage(x: number, y: number) {
    return {
      x: Math.min(Math.max(0, x), Math.max(0, annotationStageWidth.value)),
      y: Math.min(Math.max(0, y), Math.max(0, annotationStageHeight.value)),
    }
  }

  function clampSelectionBoxPosition(box: AnnotationSelectionBox) {
    return {
      ...box,
      x: Math.min(Math.max(0, box.x), Math.max(0, annotationStageWidth.value - box.width)),
      y: Math.min(Math.max(0, box.y), Math.max(0, annotationStageHeight.value - box.height)),
    }
  }

  function getResizedSelectionBox(originBox: AnnotationSelectionBox, handle: ResizeHandle, dx: number, dy: number) {
    const minWidth = 24
    const minHeight = 24
    let left = originBox.x
    let right = originBox.x + originBox.width
    let top = originBox.y
    let bottom = originBox.y + originBox.height

    if (handle.endsWith('w'))
      left = Math.min(Math.max(0, originBox.x + dx), right - minWidth)
    else
      right = Math.max(Math.min(annotationStageWidth.value, right + dx), left + minWidth)

    if (handle.startsWith('n'))
      top = Math.min(Math.max(0, originBox.y + dy), bottom - minHeight)
    else
      bottom = Math.max(Math.min(annotationStageHeight.value, bottom + dy), top + minHeight)

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }
  }

  function boxFromArrowGeometry(geometry: Extract<DrawAnnotationGeometry, { kind: 'arrow' }>): AnnotationSelectionBox {
    return {
      x: Math.min(geometry.x1, geometry.x2),
      y: Math.min(geometry.y1, geometry.y2),
      width: Math.abs(geometry.x2 - geometry.x1),
      height: Math.abs(geometry.y2 - geometry.y1),
    }
  }

  function mergeSelectionBoxes(boxes: AnnotationSelectionBox[]) {
    if (!boxes.length)
      return null

    const left = Math.min(...boxes.map(box => box.x))
    const top = Math.min(...boxes.map(box => box.y))
    const right = Math.max(...boxes.map(box => box.x + box.width))
    const bottom = Math.max(...boxes.map(box => box.y + box.height))

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }
  }

  function getAnnotationTargetBox(target: AnnotationSelectionTarget) {
    if (target.kind === 'draw') {
      if (target.shape === 'arrow') {
        const geometry = getDrawAnnotationGeometry(target)
        return geometry?.kind === 'arrow' ? boxFromArrowGeometry(geometry) : null
      }

      const node = getAnnotationDrawNodeById(target.id)
      return node ? getSvgElementBox(node as SVGGraphicsElement) : null
    }

    const textElement = getAnnotationTextElementById(target.id)
    return textElement ? getSvgElementBox(textElement) : null
  }

  function clearAnnotationSelection() {
    annotationSelectedTargets.value = []
    annotationSelection.value = null
    annotationSelectionBox.value = null
    annotationArrowSelectionLine.value = null
    annotationSelectionTransform.value = null
  }

  function syncAnnotationSelectionBox() {
    const targets = annotationSelectedTargets.value
    if (!targets.length) {
      annotationSelection.value = null
      annotationSelectionBox.value = null
      annotationArrowSelectionLine.value = null
      return
    }

    const validTargets = targets.filter((target) => {
      if (target.kind === 'draw')
        return Boolean(target.shape && isSelectableDrawAnnotationKind(target.shape) && getAnnotationDrawNodeById(target.id))

      return Boolean(getAnnotationTextElementById(target.id))
    })

    if (!validTargets.length) {
      clearAnnotationSelection()
      return
    }

    setAnnotationSelections(validTargets, validTargets.find(target => isSameAnnotationTarget(target, annotationSelection.value)) ?? validTargets.at(-1))
    annotationSelectionBox.value = mergeSelectionBoxes(validTargets.map(target => getAnnotationTargetBox(target)).filter(Boolean) as AnnotationSelectionBox[])

    if (validTargets.length === 1 && validTargets[0].kind === 'draw' && validTargets[0].shape === 'arrow') {
      const geometry = getDrawAnnotationGeometry(validTargets[0])
      annotationArrowSelectionLine.value = geometry?.kind === 'arrow' ? geometry : null
    }
    else {
      annotationArrowSelectionLine.value = null
    }
  }

  function syncAnnotationSelectionBoxSoon() {
    void nextTick(() => {
      syncAnnotationSelectionBox()
    })
  }

  function annotationSelectionFrameStyle() {
    const box = annotationSelectionBox.value
    if (!box)
      return undefined

    return {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    }
  }

  function annotationSelectionActionsStyle() {
    const box = annotationSelectionBox.value
    if (!box)
      return undefined

    const actionWidth = annotationCanAlign.value ? 344 : 176
    let left = box.x + box.width + 12
    if (left + actionWidth > annotationStageWidth.value - 8)
      left = Math.max(8, box.x + box.width - actionWidth)

    return {
      left: `${left}px`,
      top: `${Math.max(8, Math.min(box.y, annotationStageHeight.value - 88))}px`,
    }
  }

  function annotationTextEditorStyle() {
    const draft = annotationTextDraft.value
    if (!draft)
      return undefined

    const point = clampTextDraftPosition(draft.x, draft.y)
    return {
      left: `${point.x}px`,
      top: `${point.y}px`,
    }
  }

  function annotationResizeHandleStyle(handle: ResizeHandle) {
    const box = annotationSelectionBox.value
    if (!box)
      return undefined

    return {
      left: handle.endsWith('w') ? '0px' : `${box.width}px`,
      top: handle.startsWith('n') ? '0px' : `${box.height}px`,
    }
  }

  function annotationArrowHandleStyle(which: 'start' | 'end') {
    const arrow = annotationArrowSelectionLine.value
    if (!arrow)
      return undefined

    return {
      left: `${which === 'start' ? arrow.x1 : arrow.x2}px`,
      top: `${which === 'start' ? arrow.y1 : arrow.y2}px`,
    }
  }

  function annotationHistorySignature(snapshot: AnnotationSnapshot) {
    return JSON.stringify(snapshot)
  }

  function getAnnotationSnapshot(): AnnotationSnapshot {
    return {
      drawSvg: annotationDrauu?.dump() ?? '',
      texts: cloneTextAnnotations(),
    }
  }

  function persistAnnotationCache() {
    if (typeof window === 'undefined')
      return

    const snapshot = normalizeAnnotationSnapshot(getAnnotationSnapshot())
    if (!snapshot)
      return

    if (snapshot.drawSvg.trim() || snapshot.texts.length) {
      window.localStorage.setItem(ANNOTATION_CACHE_STORAGE_KEY, JSON.stringify({
        content: input.value,
        snapshot,
      } satisfies PersistedAnnotationCache))
    }
    else {
      window.localStorage.removeItem(ANNOTATION_CACHE_STORAGE_KEY)
    }

    const activeShareStorageKey = getActiveShareStorageKey?.()
    if (activeShareStorageKey) {
      window.localStorage.setItem(activeShareStorageKey, JSON.stringify({
        content: input.value,
        annotations: snapshot,
      }))
    }
  }

  const persistAnnotationCacheDebounced = useDebounceFn(() => {
    persistAnnotationCache()
  }, 140)

  function restoreAnnotationCache() {
    if (typeof window === 'undefined')
      return null

    const raw = window.localStorage.getItem(ANNOTATION_CACHE_STORAGE_KEY)
    if (!raw)
      return null

    try {
      const parsed = JSON.parse(raw) as PersistedAnnotationCache
      if (parsed && typeof parsed.content === 'string' && parsed.content === input.value)
        return normalizeAnnotationSnapshot(parsed.snapshot)
    }
    catch {
    }

    return null
  }

  function pushAnnotationHistory(snapshot = getAnnotationSnapshot()) {
    if (isApplyingAnnotationHistory.value)
      return

    const current = annotationHistory.value[annotationHistoryIndex.value]
    if (current && annotationHistorySignature(current) === annotationHistorySignature(snapshot))
      return

    annotationHistory.value = [
      ...annotationHistory.value.slice(0, annotationHistoryIndex.value + 1),
      snapshot,
    ]
    annotationHistoryIndex.value = annotationHistory.value.length - 1
    persistAnnotationCacheDebounced()
  }

  function applyAnnotationSnapshot(snapshot: AnnotationSnapshot) {
    if (!annotationDrauu)
      return

    isApplyingAnnotationHistory.value = true
    annotationDrauu.cancel()
    annotationDrauu.load(snapshot.drawSvg)
    syncAnnotationDrawNodeIds()
    annotationTextItems.value = cloneTextAnnotations(snapshot.texts)
    isApplyingAnnotationHistory.value = false
    syncAnnotationSelectionBoxSoon()
  }

  function buildAnnotationBrush(): Brush {
    const modeMap: Record<Exclude<AnnotationTool, 'text' | 'select'>, DrawingMode> = {
      pen: 'stylus',
      arrow: 'line',
      rect: 'rectangle',
      ellipse: 'ellipse',
    }

    if (annotationTool.value === 'text' || annotationTool.value === 'select') {
      return {
        color: annotationColor.value,
        size: annotationStrokeWidth.value,
        mode: 'stylus',
      }
    }

    return {
      color: annotationColor.value,
      size: annotationStrokeWidth.value,
      mode: modeMap[annotationTool.value],
      fill: 'transparent',
      arrowEnd: annotationTool.value === 'arrow',
    }
  }

  function collectSelectionTransformData(targets: AnnotationSelectionTarget[], primaryTarget: AnnotationSelectionTarget) {
    const nextTargets = cloneSelectionTargets(targets)
    const textStates = Object.fromEntries(nextTargets
      .filter(item => item.kind === 'text')
      .map((item) => {
        const text = getAnnotationTextById(item.id)
        return [annotationSelectionKey(item), text ? { x: text.x, y: text.y, fontSize: text.fontSize } : null]
      })
      .filter((entry): entry is [string, AnnotationTextTransformState] => Boolean(entry[1])))
    const drawStates = Object.fromEntries(nextTargets
      .filter(item => item.kind === 'draw')
      .map((item) => {
        const geometry = getDrawAnnotationGeometry(item)
        return [annotationSelectionKey(item), geometry ?? null]
      })
      .filter((entry): entry is [string, DrawAnnotationGeometry] => Boolean(entry[1])))

    return {
      targets: nextTargets,
      textStates,
      drawStates,
      textState: textStates[annotationSelectionKey(primaryTarget)],
      drawGeometry: drawStates[annotationSelectionKey(primaryTarget)],
    }
  }

  function syncAnnotationBrush() {
    if (!annotationDrauu)
      return

    annotationDrauu.brush = buildAnnotationBrush()
  }

  function syncAnnotationStageSize() {
    const stage = previewStageRef.value
    if (!stage)
      return

    annotationStageWidth.value = Math.max(1, Math.round(stage.clientWidth))
    annotationStageHeight.value = Math.max(1, Math.round(stage.scrollHeight))
  }

  function mountAnnotationDrauu() {
    if (annotationDrauu || !annotationDrawSvgRef.value)
      return

    annotationDrauu = createDrauu({
      el: annotationDrawSvgRef.value,
      brush: buildAnnotationBrush(),
    })
    annotationDrauu.on('committed', (node) => {
      if (node instanceof SVGElement) {
        const kindMap: Record<Exclude<AnnotationTool, 'select' | 'text'>, DrawAnnotationKind> = {
          pen: 'pen',
          arrow: 'arrow',
          rect: 'rect',
          ellipse: 'ellipse',
        }

        const kind = annotationTool.value === 'text' || annotationTool.value === 'select'
          ? inferDrawAnnotationKind(node)
          : kindMap[annotationTool.value]
        applyDrawNodeMetadata(node, kind)
      }

      pushAnnotationHistory()
    })

    const snapshot = annotationHistory.value[annotationHistoryIndex.value]
    if (snapshot.drawSvg) {
      annotationDrauu.load(snapshot.drawSvg)
      syncAnnotationDrawNodeIds()
    }
  }

  function clampTextDraftPosition(x: number, y: number) {
    return {
      x: Math.min(Math.max(16, x), Math.max(16, annotationStageWidth.value - ANNOTATION_TEXT_EDITOR_WIDTH - 16)),
      y: Math.min(Math.max(16, y), Math.max(16, annotationStageHeight.value - 112)),
    }
  }

  function suppressNextTextAnnotationPlacement() {
    annotationIgnoreTextPlacementUntil.value = Date.now() + ANNOTATION_TEXT_PLACEMENT_SUPPRESS_MS
  }

  function shouldIgnoreTextAnnotationPlacement(event: PointerEvent) {
    if (Date.now() < annotationIgnoreTextPlacementUntil.value)
      return true

    if (!(event.target instanceof Element))
      return false

    return Boolean(event.target.closest('.preview-annotation-text-editor'))
  }

  function toggleAnnotationMode() {
    annotationEnabled.value = !annotationEnabled.value

    if (!annotationEnabled.value) {
      annotationDrauu?.cancel()
      annotationTextDraft.value = null
      clearAnnotationSelection()
    }
    else {
      void nextTick(() => {
        syncAnnotationStageSize()
        syncAnnotationSelectionBox()
        if (annotationTool.value === 'text')
          annotationTextInputRef.value?.focus()
      })
    }
  }

  function startTextAnnotation(event: PointerEvent) {
    if (!annotationTextInteractive.value)
      return

    if (shouldIgnoreTextAnnotationPlacement(event))
      return

    event.preventDefault()
    event.stopPropagation()

    if (annotationTextDraft.value?.content.trim())
      commitTextAnnotationDraft()
    else
      annotationTextDraft.value = null

    const stage = previewStageRef.value
    if (!stage)
      return

    const rect = stage.getBoundingClientRect()
    const point = clampPointToStage(event.clientX - rect.left, event.clientY - rect.top)
    annotationTextDraft.value = {
      x: point.x,
      y: point.y,
      content: '',
      color: annotationColor.value,
      fontSize: annotationFontSize.value,
    }

    void nextTick(() => {
      annotationTextInputRef.value?.focus()
    })
  }

  function cancelTextAnnotationDraft() {
    annotationTextDraft.value = null
  }

  function commitTextAnnotationDraft() {
    const draft = annotationTextDraft.value
    if (!draft)
      return

    const content = draft.content.trim()
    annotationTextDraft.value = null

    if (!content)
      return

    if (draft.id) {
      annotationTextItems.value = annotationTextItems.value.map(text => text.id === draft.id
        ? {
            ...text,
            x: draft.x,
            y: draft.y,
            content,
            color: draft.color ?? text.color,
            fontSize: draft.fontSize ?? text.fontSize,
          }
        : text)
      const target = { kind: 'text', id: draft.id } satisfies AnnotationSelectionTarget
      setAnnotationSelections([target], target)
      pushAnnotationHistory()
      syncAnnotationSelectionBoxSoon()
      return
    }

    annotationTextItems.value = [
      ...annotationTextItems.value,
      {
        id: createAnnotationId(),
        x: draft.x,
        y: draft.y,
        content,
        color: draft.color ?? annotationColor.value,
        fontSize: draft.fontSize ?? annotationFontSize.value,
      },
    ]
    pushAnnotationHistory()
  }

  function updateAnnotationSelectionsFromPointer(target: AnnotationSelectionTarget, event: PointerEvent) {
    if (isMultiSelectionEvent(event)) {
      if (isAnnotationTargetSelected(target)) {
        const nextTargets = annotationSelectedTargets.value.filter(item => !isSameAnnotationTarget(item, target))
        setAnnotationSelections(nextTargets)
      }
      else {
        setAnnotationSelections([...annotationSelectedTargets.value, target], target)
      }

      syncAnnotationSelectionBoxSoon()
      return false
    }

    if (!isAnnotationTargetSelected(target))
      setAnnotationSelections([target], target)
    else
      annotationSelection.value = { ...target }

    syncAnnotationSelectionBox()
    return true
  }

  function buildSelectionTransformState(target: AnnotationSelectionTarget, event: PointerEvent, mode: AnnotationSelectionTransformState['mode'], handle?: ResizeHandle, drawGeometry?: DrawAnnotationGeometry) {
    const originBox = annotationSelectionBox.value
    if (!originBox)
      return null

    const transformData = collectSelectionTransformData(annotationSelectedTargets.value, target)

    return {
      target,
      targets: transformData.targets,
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originBox,
      handle,
      drawGeometry: drawGeometry ?? transformData.drawGeometry,
      drawStates: transformData.drawStates,
      textState: transformData.textState,
      textStates: transformData.textStates,
      duplicateOnMove: mode === 'move' && event.altKey,
      moved: false,
    } satisfies AnnotationSelectionTransformState
  }

  function startTextSelection(annotationText: TextAnnotation, event: PointerEvent) {
    if (!annotationTextLayerInteractive.value || annotationTextDraft.value)
      return

    event.preventDefault()
    event.stopPropagation()

    const target: AnnotationSelectionTarget = {
      kind: 'text',
      id: annotationText.id,
    }
    if (!updateAnnotationSelectionsFromPointer(target, event))
      return

    annotationArrowSelectionLine.value = null
    annotationSelectionTransform.value = buildSelectionTransformState(target, event, 'move')
  }

  function editTextAnnotation(annotationText: TextAnnotation, event: MouseEvent) {
    if (!annotationTextLayerInteractive.value)
      return

    event.preventDefault()
    event.stopPropagation()
    suppressNextTextAnnotationPlacement()

    const target = { kind: 'text', id: annotationText.id } satisfies AnnotationSelectionTarget
    setAnnotationSelections([target], target)
    syncAnnotationSelectionBoxSoon()
    annotationTextDraft.value = {
      id: annotationText.id,
      x: annotationText.x,
      y: annotationText.y,
      content: annotationText.content,
      color: annotationText.color,
      fontSize: annotationText.fontSize,
    }

    void nextTick(() => {
      annotationTextInputRef.value?.focus()
      annotationTextInputRef.value?.select()
    })
  }

  function editSelectedTextAnnotation(event: MouseEvent) {
    const selection = annotationSelection.value
    if (annotationSelectedTargets.value.length !== 1 || selection?.kind !== 'text')
      return

    const annotationText = getAnnotationTextById(selection.id)
    if (!annotationText)
      return

    editTextAnnotation(annotationText, event)
  }

  function findSelectableTextAnnotation(eventTarget: EventTarget | null) {
    if (!(eventTarget instanceof Element))
      return null

    const textItem = eventTarget.closest('.preview-annotation-text-item[data-annotation-id]')
    const id = textItem?.getAttribute('data-annotation-id')
    if (!id)
      return null

    return {
      kind: 'text',
      id,
    } satisfies AnnotationSelectionTarget
  }

  function isPointInsideBox(point: { x: number, y: number }, box: AnnotationSelectionBox, padding = 0) {
    return point.x >= box.x - padding
      && point.x <= box.x + box.width + padding
      && point.y >= box.y - padding
      && point.y <= box.y + box.height + padding
  }

  function getPointToSegmentDistance(point: { x: number, y: number }, start: { x: number, y: number }, end: { x: number, y: number }) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    if (!dx && !dy)
      return Math.hypot(point.x - start.x, point.y - start.y)

    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx ** 2 + dy ** 2)))
    const projectionX = start.x + t * dx
    const projectionY = start.y + t * dy
    return Math.hypot(point.x - projectionX, point.y - projectionY)
  }

  function findSelectableAnnotationAtStagePoint(point: { x: number, y: number }, options: { excludeSelected?: boolean } = {}) {
    const textTargets = [...annotationTextItems.value].reverse().map(text => ({ kind: 'text', id: text.id } satisfies AnnotationSelectionTarget))
    for (const target of textTargets) {
      if (options.excludeSelected && isAnnotationTargetSelected(target))
        continue

      const box = getAnnotationTargetBox(target)
      if (box && isPointInsideBox(point, box, 6))
        return target
    }

    const drawNodes = [...getAnnotationDrawNodes()].reverse()
    const drawTargets: Array<{ kind: 'draw', id: string, shape: 'arrow' | 'rect' | 'ellipse' }> = []

    for (const node of drawNodes) {
      const shape = inferDrawAnnotationKind(node)
      if (!isSelectableDrawAnnotationKind(shape) || !node.dataset.annotationId)
        continue

      drawTargets.push({
        kind: 'draw',
        id: node.dataset.annotationId,
        shape,
      })
    }

    for (const target of drawTargets) {
      if (options.excludeSelected && isAnnotationTargetSelected(target))
        continue

      if (target.shape === 'arrow') {
        const geometry = getDrawAnnotationGeometry(target)
        if (geometry?.kind === 'arrow' && getPointToSegmentDistance(point, { x: geometry.x1, y: geometry.y1 }, { x: geometry.x2, y: geometry.y2 }) <= 10)
          return target
        continue
      }

      const box = getAnnotationTargetBox(target)
      if (box && isPointInsideBox(point, box, 6))
        return target
    }

    return null
  }

  function findSelectableDrawAnnotation(eventTarget: EventTarget | null) {
    const drawSvg = annotationDrawSvgRef.value
    if (!(eventTarget instanceof Element) || !drawSvg)
      return null

    let current: Element | null = eventTarget
    while (current && current !== drawSvg) {
      if (current instanceof SVGElement && current.dataset.annotationId) {
        const shape = inferDrawAnnotationKind(current)
        if (!isSelectableDrawAnnotationKind(shape))
          return null

        return {
          node: current,
          target: {
            kind: 'draw',
            id: current.dataset.annotationId,
            shape,
          } satisfies AnnotationSelectionTarget,
        }
      }

      current = current.parentElement
    }

    return null
  }

  function findSelectableAnnotationAtPoint(clientX: number, clientY: number, options: { excludeSelected?: boolean } = {}) {
    const point = getStagePointerPosition(new PointerEvent('pointermove', { clientX, clientY }))
    if (point) {
      const target = findSelectableAnnotationAtStagePoint(point, options)
      if (target)
        return target
    }

    if (typeof document === 'undefined')
      return null

    for (const element of document.elementsFromPoint(clientX, clientY)) {
      if (!(element instanceof Element))
        continue

      if (element.closest('.preview-annotation-selection__actions, .preview-annotation-selection__handle'))
        continue

      const target = findSelectableTextAnnotation(element) ?? findSelectableDrawAnnotation(element)?.target ?? null
      if (!target)
        continue

      if (options.excludeSelected && isAnnotationTargetSelected(target))
        continue

      return target
    }

    return null
  }

  function startDrawSelection(event: PointerEvent) {
    if (!annotationEnabled.value || !showPreviewAnnotations.value || annotationTool.value !== 'select')
      return

    event.preventDefault()
    event.stopPropagation()

    const match = findSelectableDrawAnnotation(event.target)
    if (!match) {
      if (!isMultiSelectionEvent(event))
        clearAnnotationSelection()
      return
    }

    const geometry = getDrawAnnotationGeometry(match.target)
    if (!geometry || !updateAnnotationSelectionsFromPointer(match.target, event))
      return

    annotationArrowSelectionLine.value = annotationSingleArrowSelection.value && geometry.kind === 'arrow' ? geometry : null
    annotationSelectionTransform.value = buildSelectionTransformState(match.target, event, 'move', undefined, geometry)
  }

  function startSelectedAnnotationMove(event: PointerEvent) {
    if (!annotationSelection.value || annotationTool.value !== 'select')
      return

    const hitTarget = findSelectableAnnotationAtPoint(event.clientX, event.clientY, {
      excludeSelected: isMultiSelectionEvent(event),
    })
    if (hitTarget && (!isAnnotationTargetSelected(hitTarget) || !isSameAnnotationTarget(hitTarget, annotationSelection.value))) {
      event.preventDefault()
      event.stopPropagation()

      const geometry = hitTarget.kind === 'draw'
        ? getDrawAnnotationGeometry(hitTarget)
        : undefined
      if (!updateAnnotationSelectionsFromPointer(hitTarget, event))
        return

      annotationArrowSelectionLine.value = hitTarget.kind === 'draw' && hitTarget.shape === 'arrow' && geometry?.kind === 'arrow'
        ? geometry
        : null
      annotationSelectionTransform.value = buildSelectionTransformState(hitTarget, event, 'move', undefined, geometry ?? undefined)
      return
    }

    if (isMultiSelectionEvent(event)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const geometry = annotationSelection.value.kind === 'draw'
      ? getDrawAnnotationGeometry(annotationSelection.value)
      : undefined
    annotationSelectionTransform.value = buildSelectionTransformState(annotationSelection.value, event, 'move', undefined, geometry ?? undefined)
  }

  function startSelectedAnnotationResize(handle: ResizeHandle, event: PointerEvent) {
    const selection = annotationSelection.value
    if (!selection || !annotationSelectionCanResize.value || !annotationSelectionBox.value)
      return

    event.preventDefault()
    event.stopPropagation()

    const geometry = selection.kind === 'draw' ? getDrawAnnotationGeometry(selection) : undefined
    annotationSelectionTransform.value = buildSelectionTransformState(selection, event, 'resize', handle, geometry ?? undefined)
  }

  function startSelectedArrowHandle(which: 'start' | 'end', event: PointerEvent) {
    const selection = annotationSelection.value
    if (!selection || selection.kind !== 'draw' || selection.shape !== 'arrow')
      return

    const geometry = getDrawAnnotationGeometry(selection)
    if (!geometry || geometry.kind !== 'arrow')
      return

    event.preventDefault()
    event.stopPropagation()

    annotationSelectionTransform.value = buildSelectionTransformState(selection, event, which === 'start' ? 'arrow-start' : 'arrow-end', undefined, geometry)
  }

  function syncSelectionTransform(state: AnnotationSelectionTransformState, dx: number, dy: number, event: PointerEvent) {
    if ((state.mode === 'arrow-start' || state.mode === 'arrow-end') && state.drawGeometry?.kind === 'arrow') {
      const point = getStagePointerPosition(event)
      if (!point)
        return false

      const nextArrow = state.mode === 'arrow-start'
        ? { ...state.drawGeometry, x1: point.x, y1: point.y }
        : { ...state.drawGeometry, x2: point.x, y2: point.y }

      if (!applyDrawAnnotationGeometry(state.target, nextArrow))
        return false

      annotationArrowSelectionLine.value = nextArrow
      annotationSelectionBox.value = boxFromArrowGeometry(nextArrow)
      return true
    }

    if (state.mode === 'move' && state.duplicateOnMove && !state.moved && (dx !== 0 || dy !== 0)) {
      const duplicated = duplicateAnnotationTargets(state.targets, 0, 0, state.target)
      if (!duplicated)
        return false

      applyAnnotationSnapshot(duplicated.snapshot)
      setAnnotationSelections(duplicated.targets, duplicated.primaryTarget)
      syncAnnotationSelectionBox()

      const primaryTarget = duplicated.primaryTarget ?? duplicated.targets.at(-1)
      const originBox = annotationSelectionBox.value
      if (!primaryTarget || !originBox)
        return false

      const transformData = collectSelectionTransformData(duplicated.targets, primaryTarget)
      state.target = primaryTarget
      state.targets = transformData.targets
      state.originBox = originBox
      state.drawGeometry = transformData.drawGeometry
      state.drawStates = transformData.drawStates
      state.textState = transformData.textState
      state.textStates = transformData.textStates
      state.duplicateOnMove = false
    }

    const nextBox = state.mode === 'move'
      ? clampSelectionBoxPosition({
          ...state.originBox,
          x: state.originBox.x + dx,
          y: state.originBox.y + dy,
        })
      : getResizedSelectionBox(state.originBox, state.handle!, dx, dy)

    const offsetX = nextBox.x - state.originBox.x
    const offsetY = nextBox.y - state.originBox.y
    const nextTextById = new Map<string, Partial<TextAnnotation>>()

    for (const target of state.targets) {
      if (target.kind === 'text') {
        const originText = state.textStates?.[annotationSelectionKey(target)]
        if (!originText)
          continue

        if (state.mode === 'move') {
          nextTextById.set(target.id, {
            x: originText.x + offsetX,
            y: originText.y + offsetY,
            fontSize: originText.fontSize,
          })
        }
        else {
          const scaleX = nextBox.width / Math.max(state.originBox.width, 1)
          const scaleY = nextBox.height / Math.max(state.originBox.height, 1)
          nextTextById.set(target.id, {
            x: nextBox.x + (originText.x - state.originBox.x) * scaleX,
            y: nextBox.y + (originText.y - state.originBox.y) * scaleY,
            fontSize: Math.max(14, Math.round(originText.fontSize * Math.max(scaleX, scaleY))),
          })
        }
        continue
      }

      const originGeometry = state.drawStates?.[annotationSelectionKey(target)]
      if (!originGeometry)
        continue

      const nextGeometry = state.mode === 'move'
        ? offsetDrawGeometry(originGeometry, offsetX, offsetY)
        : transformDrawGeometryBySelectionBox(originGeometry, state.originBox, nextBox)

      if (!applyDrawAnnotationGeometry(target, nextGeometry))
        return false

      if (state.targets.length === 1 && nextGeometry.kind === 'arrow')
        annotationArrowSelectionLine.value = nextGeometry
    }

    if (nextTextById.size) {
      annotationTextItems.value = annotationTextItems.value.map((text) => {
        const nextText = nextTextById.get(text.id)
        return nextText ? { ...text, ...nextText } : text
      })
    }

    annotationSelectionBox.value = nextBox
    if (!(state.targets.length === 1 && state.target.kind === 'draw' && state.target.shape === 'arrow'))
      annotationArrowSelectionLine.value = null

    return true
  }

  function onAnnotationSelectionPointerMove(event: PointerEvent) {
    const state = annotationSelectionTransform.value
    if (!state || state.pointerId !== event.pointerId)
      return

    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    const changed = syncSelectionTransform(state, dx, dy, event)

    if (!changed)
      return

    if (dx !== 0 || dy !== 0)
      state.moved = true

    event.preventDefault()
  }

  function finishAnnotationSelectionTransform(pointerId?: number) {
    const state = annotationSelectionTransform.value
    if (!state || (pointerId != null && state.pointerId !== pointerId))
      return

    annotationSelectionTransform.value = null

    if (state.moved)
      pushAnnotationHistory()

    syncAnnotationSelectionBoxSoon()
  }

  function onAnnotationSelectionPointerUp(event: PointerEvent) {
    finishAnnotationSelectionTransform(event.pointerId)
  }

  function applyCommittedAnnotationSnapshot(snapshot: AnnotationSnapshot, nextTargets: AnnotationSelectionTarget[] = [], primaryTarget?: AnnotationSelectionTarget | null) {
    applyAnnotationSnapshot(snapshot)
    setAnnotationSelections(nextTargets, primaryTarget ?? nextTargets.at(-1) ?? null)
    pushAnnotationHistory(snapshot)
  }

  function cloneDrawNode(node: SVGElement) {
    const clone = node.cloneNode(true) as SVGElement
    clone.dataset.annotationId = createAnnotationId()
    const marker = clone.querySelector('marker[id]')
    const line = getArrowLineElement(clone)
    if (marker && line) {
      const markerId = createAnnotationId()
      marker.setAttribute('id', markerId)
      line.setAttribute('marker-end', `url(#${markerId})`)
    }
    return clone
  }

  function duplicateAnnotationTargets(targets: AnnotationSelectionTarget[], offsetX: number, offsetY: number, primaryTarget?: AnnotationSelectionTarget | null) {
    if (!targets.length || !annotationDrauu)
      return null

    const nextTexts = cloneTextAnnotations()
    const drawSvg = annotationDrawSvgRef.value
    if (!drawSvg)
      return null

    const duplicatedTargets: AnnotationSelectionTarget[] = []
    let duplicatedPrimaryTarget: AnnotationSelectionTarget | null = null

    for (const target of targets) {
      let duplicatedTarget: AnnotationSelectionTarget | null = null

      if (target.kind === 'text') {
        const source = getAnnotationTextById(target.id)
        if (!source)
          continue

        const point = clampPointToStage(source.x + offsetX, source.y + offsetY)
        const duplicate = {
          ...source,
          id: createAnnotationId(),
          x: point.x,
          y: point.y,
        }
        nextTexts.push(duplicate)
        duplicatedTarget = { kind: 'text', id: duplicate.id }
      }
      else {
        const sourceNode = getAnnotationDrawNodeById(target.id)
        const sourceGeometry = getDrawAnnotationGeometry(target)
        if (!sourceNode || !sourceGeometry)
          continue

        const duplicateNode = cloneDrawNode(sourceNode)
        applyDrawNodeMetadata(duplicateNode, target.shape)
        applyDrawGeometryToNode(duplicateNode, offsetDrawGeometry(sourceGeometry, offsetX, offsetY))
        drawSvg.appendChild(duplicateNode)
        duplicatedTarget = {
          kind: 'draw',
          id: duplicateNode.dataset.annotationId!,
          shape: inferDrawAnnotationKind(duplicateNode),
        }
      }

      if (!duplicatedTarget)
        continue

      duplicatedTargets.push(duplicatedTarget)
      if (isSameAnnotationTarget(target, primaryTarget))
        duplicatedPrimaryTarget = duplicatedTarget
    }

    return {
      snapshot: {
        drawSvg: annotationDrauu.dump(),
        texts: nextTexts,
      } satisfies AnnotationSnapshot,
      targets: duplicatedTargets,
      primaryTarget: duplicatedPrimaryTarget ?? duplicatedTargets.at(-1) ?? null,
    }
  }

  function duplicateSelectedAnnotation() {
    const targets = cloneSelectionTargets()
    const duplicated = duplicateAnnotationTargets(targets, ANNOTATION_DUPLICATE_OFFSET, ANNOTATION_DUPLICATE_OFFSET, annotationSelection.value)
    if (!duplicated)
      return

    applyCommittedAnnotationSnapshot(duplicated.snapshot, duplicated.targets, duplicated.primaryTarget)
  }

  function alignSelectedAnnotations(mode: AnnotationAlignMode) {
    const targets = cloneSelectionTargets()
    const selectionBox = annotationSelectionBox.value
    if (!annotationDrauu || targets.length < 2 || !selectionBox)
      return

    let nextTexts = cloneTextAnnotations()

    for (const target of targets) {
      const box = getAnnotationTargetBox(target)
      if (!box)
        continue

      const dx = mode === 'left'
        ? selectionBox.x - box.x
        : mode === 'hcenter'
          ? selectionBox.x + selectionBox.width / 2 - (box.x + box.width / 2)
          : mode === 'right'
            ? selectionBox.x + selectionBox.width - (box.x + box.width)
            : 0
      const dy = mode === 'top'
        ? selectionBox.y - box.y
        : mode === 'vcenter'
          ? selectionBox.y + selectionBox.height / 2 - (box.y + box.height / 2)
          : mode === 'bottom'
            ? selectionBox.y + selectionBox.height - (box.y + box.height)
            : 0

      if (dx === 0 && dy === 0)
        continue

      if (target.kind === 'text') {
        nextTexts = nextTexts.map(text => text.id === target.id ? { ...text, x: text.x + dx, y: text.y + dy } : text)
        continue
      }

      const geometry = getDrawAnnotationGeometry(target)
      if (!geometry)
        continue

      if (!applyDrawAnnotationGeometry(target, offsetDrawGeometry(geometry, dx, dy)))
        return
    }

    annotationTextItems.value = nextTexts
    pushAnnotationHistory({
      drawSvg: annotationDrauu.dump(),
      texts: nextTexts,
    })
    setAnnotationSelections(targets, annotationSelection.value)
    syncAnnotationSelectionBoxSoon()
  }

  function bringSelectedAnnotationToFront() {
    const targets = cloneSelectionTargets()
    if (!targets.length || !annotationDrauu)
      return

    let nextTexts = cloneTextAnnotations()
    const drawSvg = annotationDrawSvgRef.value

    for (const target of targets) {
      if (target.kind === 'text') {
        const text = nextTexts.find(item => item.id === target.id)
        if (!text)
          continue
        nextTexts = [...nextTexts.filter(item => item.id !== target.id), text]
        continue
      }

      const node = getAnnotationDrawNodeById(target.id)
      if (node && drawSvg)
        drawSvg.appendChild(node)
    }

    applyCommittedAnnotationSnapshot({
      drawSvg: annotationDrauu.dump(),
      texts: nextTexts,
    }, targets)
  }

  function deleteSelectedAnnotation() {
    const targets = cloneSelectionTargets()
    if (!targets.length || !annotationDrauu)
      return

    const targetKeys = new Set(targets.map(annotationSelectionKey))
    const drawSvg = annotationDrawSvgRef.value
    if (!drawSvg)
      return

    getAnnotationDrawNodes().forEach((node) => {
      const target: AnnotationSelectionTarget = {
        kind: 'draw',
        id: node.dataset.annotationId ?? '',
        shape: inferDrawAnnotationKind(node),
      }
      if (target.id && targetKeys.has(annotationSelectionKey(target)))
        node.remove()
    })

    applyCommittedAnnotationSnapshot({
      drawSvg: annotationDrauu.dump(),
      texts: cloneTextAnnotations().filter(text => !targetKeys.has(annotationSelectionKey({ kind: 'text', id: text.id }))),
    })
    clearAnnotationSelection()
  }

  function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement))
      return false

    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  }

  function onAnnotationShortcutKeydown(event: KeyboardEvent) {
    if (!showPreviewAnnotations.value)
      return

    if (isEditableTarget(event.target))
      return

    const key = event.key.toLowerCase()

    if (key === 'a' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      toggleAnnotationMode()
      return
    }

    if (!annotationEnabled.value)
      return

    if (key === 'v' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      annotationTool.value = 'select'
      return
    }

    if ((key === 'delete' || key === 'backspace') && annotationSelectedTargets.value.length) {
      event.preventDefault()
      deleteSelectedAnnotation()
      return
    }

    if (key === 'escape' && annotationSelectedTargets.value.length) {
      event.preventDefault()
      clearAnnotationSelection()
      return
    }

    if (!(event.metaKey || event.ctrlKey))
      return

    if (key === 'z' && event.shiftKey) {
      event.preventDefault()
      redoAnnotation()
      return
    }

    if (key === 'y') {
      event.preventDefault()
      redoAnnotation()
      return
    }

    if (key === 'z') {
      event.preventDefault()
      undoAnnotation()
    }
  }

  function undoAnnotation() {
    if (!annotationCanUndo.value)
      return

    annotationTextDraft.value = null
    annotationSelectionTransform.value = null
    annotationHistoryIndex.value -= 1
    applyAnnotationSnapshot(annotationHistory.value[annotationHistoryIndex.value])
  }

  function redoAnnotation() {
    if (!annotationCanRedo.value)
      return

    annotationTextDraft.value = null
    annotationSelectionTransform.value = null
    annotationHistoryIndex.value += 1
    applyAnnotationSnapshot(annotationHistory.value[annotationHistoryIndex.value])
  }

  function clearAnnotations() {
    if (!annotationHasItems.value) {
      annotationTextDraft.value = null
      return
    }

    annotationTextDraft.value = null
    clearAnnotationSelection()
    annotationDrauu?.clear()
    annotationTextItems.value = []
    pushAnnotationHistory()
  }

  function resetAnnotationsForInputChange() {
    annotationTextDraft.value = null
    clearAnnotationSelection()
    annotationDrauu?.cancel()
    annotationDrauu?.clear()
    annotationTextItems.value = []
    annotationHistory.value = [{ drawSvg: '', texts: [] }]
    annotationHistoryIndex.value = 0
    persistAnnotationCacheDebounced()
  }

  function annotationTextLines(content: string) {
    return content.split('\n')
  }

  function initializeAnnotations(initialSnapshot: AnnotationSnapshot | null = null) {
    preserveAnnotationsOnNextInputChange = Boolean(initialSnapshot)
    if (preserveAnnotationsOnNextInputChange) {
      void nextTick(() => {
        preserveAnnotationsOnNextInputChange = false
      })
    }

    syncAnnotationStageSize()
    mountAnnotationDrauu()
    if (initialSnapshot) {
      annotationHistory.value = [initialSnapshot]
      annotationHistoryIndex.value = 0
      applyAnnotationSnapshot(initialSnapshot)
    }

    if (annotationsInitialized)
      return

    annotationsInitialized = true
    window.addEventListener('pointermove', onAnnotationSelectionPointerMove, { passive: false })
    window.addEventListener('pointerup', onAnnotationSelectionPointerUp, { passive: false })
    window.addEventListener('pointercancel', onAnnotationSelectionPointerUp, { passive: false })
    window.addEventListener('keydown', onAnnotationShortcutKeydown)
  }

  useResizeObserver(previewStageRef, () => {
    syncAnnotationStageSize()
    syncAnnotationSelectionBoxSoon()
  })

  watch(input, (value, previousValue) => {
    if (value !== previousValue) {
      if (preserveAnnotationsOnNextInputChange)
        preserveAnnotationsOnNextInputChange = false
      else
        resetAnnotationsForInputChange()
    }

    persistAnnotationCacheDebounced()
    void nextTick(() => {
      syncAnnotationStageSize()
      syncAnnotationSelectionBox()
    })
  })

  watch(annotationTool, (tool, previousTool) => {
    if (tool !== previousTool && tool !== 'text')
      annotationTextDraft.value = null
    if (tool !== 'select')
      clearAnnotationSelection()
    syncAnnotationBrush()
    if (tool === 'select')
      syncAnnotationSelectionBoxSoon()
  }, { immediate: true })

  watch([annotationColor, annotationStrokeWidth], () => {
    syncAnnotationBrush()
  }, { immediate: true })

  watch(showPreviewAnnotations, (visible) => {
    if (!visible) {
      annotationEnabled.value = false
      annotationTextDraft.value = null
      clearAnnotationSelection()
      annotationDrauu?.cancel()
      return
    }

    void nextTick(() => {
      syncAnnotationStageSize()
      mountAnnotationDrauu()
      applyAnnotationSnapshot(annotationHistory.value[annotationHistoryIndex.value])
    })
  })

  watch(annotationSelectedTargets, (targets) => {
    if (!targets.length) {
      annotationSelection.value = null
      annotationSelectionBox.value = null
      annotationArrowSelectionLine.value = null
      return
    }

    syncAnnotationSelectionBoxSoon()
  })

  watch(annotationTextItems, () => {
    if (annotationSelectedTargets.value.some(target => target.kind === 'text'))
      syncAnnotationSelectionBoxSoon()
  }, { deep: true })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onAnnotationSelectionPointerMove)
    window.removeEventListener('pointerup', onAnnotationSelectionPointerUp)
    window.removeEventListener('pointercancel', onAnnotationSelectionPointerUp)
    window.removeEventListener('keydown', onAnnotationShortcutKeydown)
    annotationDrauu?.unmount()
    annotationDrauu = null
    annotationsInitialized = false
  })

  return {
    ANNOTATION_ALIGN_OPTIONS,
    ANNOTATION_COLORS,
    ANNOTATION_RESIZE_HANDLES,
    ANNOTATION_SHORTCUT_HINT,
    ANNOTATION_STROKES,
    ANNOTATION_TOOL_OPTIONS,
    annotationArrowHandleStyle,
    annotationArrowSelectionLine,
    annotationArrowSelectionStyle,
    annotationCanAlign,
    annotationCanRedo,
    annotationCanUndo,
    annotationColor,
    annotationDrawInteractive,
    annotationDrawSelectable,
    annotationDrawSvgRef,
    annotationEnabled,
    annotationHasItems,
    annotationOverlayVisible,
    annotationResizeHandleStyle,
    annotationSelectionActionsStyle,
    annotationSelectionActionsVisible,
    annotationSelectionBox,
    annotationSelectionCanResize,
    annotationSelectionFrameStyle,
    annotationSelectionTransform,
    annotationSelectionVisible,
    annotationSingleArrowSelection,
    annotationStageHeight,
    annotationStageWidth,
    annotationStrokeWidth,
    annotationTextDraft,
    annotationTextEditorStyle,
    annotationTextInputRef,
    annotationTextInteractive,
    annotationTextItems,
    annotationTextLayerInteractive,
    annotationTextLines,
    annotationTextOutline,
    annotationTool,
    alignSelectedAnnotations,
    bringSelectedAnnotationToFront,
    cancelTextAnnotationDraft,
    clearAnnotations,
    commitTextAnnotationDraft,
    deleteSelectedAnnotation,
    duplicateSelectedAnnotation,
    editSelectedTextAnnotation,
    editTextAnnotation,
    getAnnotationSnapshot,
    initializeAnnotations,
    normalizeAnnotationSnapshot,
    previewStageRef,
    redoAnnotation,
    restoreAnnotationCache,
    startDrawSelection,
    startSelectedAnnotationMove,
    startSelectedAnnotationResize,
    startSelectedArrowHandle,
    startTextAnnotation,
    startTextSelection,
    suppressNextTextAnnotationPlacement,
    toggleAnnotationMode,
    undoAnnotation,
  }
}
