import {
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

export type PdfAnnotation = {
  id: string
  page: number
  type: 'highlight' | 'note'
  x: number
  y: number
  width?: number
  height?: number
  text?: string
}

export type PdfTool = 'select' | 'highlight' | 'note'

type Point = { x: number; y: number }

type Props = {
  pageNumber: number
  annotations: PdfAnnotation[]
  tool: PdfTool
  onAdd: (annotation: PdfAnnotation) => void
  children: ReactNode
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

export default function PdfAnnotationLayer({
  pageNumber,
  annotations,
  tool,
  onAdd,
  children,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<Point | null>(null)
  const [draft, setDraft] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [notePosition, setNotePosition] = useState<Point | null>(null)
  const [noteText, setNoteText] = useState('')

  function pointFromEvent(event: PointerEvent | MouseEvent): Point | null {
    const page = surfaceRef.current?.querySelector('.react-pdf__Page')
    const rect = page?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return null
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      tool !== 'highlight' ||
      (event.target as HTMLElement).closest(
        '.pdf-note-composer, .pdf-note-marker',
      )
    )
      return
    const point = pointFromEvent(event)
    if (!point) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    startRef.current = point
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return
    const point = pointFromEvent(event)
    if (!point) return
    const start = startRef.current
    setDraft({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }

  function finishHighlight(event: PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return
    const point = pointFromEvent(event)
    const start = startRef.current
    startRef.current = null
    setDraft(null)
    if (!point) return
    const rect = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    }
    if (rect.width < 0.006 || rect.height < 0.003) return
    onAdd({
      id: crypto.randomUUID(),
      page: pageNumber,
      type: 'highlight',
      ...rect,
    })
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (
      tool !== 'note' ||
      (event.target as HTMLElement).closest(
        '.pdf-note-composer, .pdf-note-marker',
      )
    )
      return
    const point = pointFromEvent(event)
    if (point) {
      setNotePosition(point)
      setNoteText('')
    }
  }

  function addNote(event: FormEvent) {
    event.preventDefault()
    if (!notePosition || !noteText.trim()) return
    onAdd({
      id: crypto.randomUUID(),
      page: pageNumber,
      type: 'note',
      ...notePosition,
      text: noteText.trim().slice(0, 240),
    })
    setNotePosition(null)
    setNoteText('')
  }

  const pageAnnotations = annotations.filter(
    (annotation) => annotation.page === pageNumber,
  )

  return (
    <div
      ref={surfaceRef}
      className={`pdf-page-surface tool-${tool}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishHighlight}
      onPointerCancel={finishHighlight}
      onClick={handleClick}
    >
      {children}
      <div
        className="pdf-annotation-layer"
        aria-label={`Annotations on page ${pageNumber}`}
      >
        {pageAnnotations.map((annotation) =>
          annotation.type === 'highlight' ? (
            <span
              key={annotation.id}
              className="pdf-highlight"
              style={{
                left: `${annotation.x * 100}%`,
                top: `${annotation.y * 100}%`,
                width: `${(annotation.width ?? 0) * 100}%`,
                height: `${(annotation.height ?? 0) * 100}%`,
              }}
              aria-label="Highlight annotation"
            />
          ) : (
            <button
              key={annotation.id}
              className="pdf-note-marker"
              style={{
                left: `${annotation.x * 100}%`,
                top: `${annotation.y * 100}%`,
              }}
              title={annotation.text}
              aria-label={`Note: ${annotation.text}`}
              onClick={(event) => event.stopPropagation()}
            >
              N
            </button>
          ),
        )}
        {draft && (
          <span
            className="pdf-highlight pdf-highlight-draft"
            style={{
              left: `${draft.x * 100}%`,
              top: `${draft.y * 100}%`,
              width: `${draft.width * 100}%`,
              height: `${draft.height * 100}%`,
            }}
          />
        )}
        {notePosition && (
          <form
            className="pdf-note-composer"
            style={{
              left: `${notePosition.x * 100}%`,
              top: `${notePosition.y * 100}%`,
            }}
            onSubmit={addNote}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <label>
              <span className="sr-only">Note text</span>
              <textarea
                autoFocus
                aria-label="Note text"
                value={noteText}
                maxLength={240}
                placeholder="Write a note"
                onChange={(event) => setNoteText(event.target.value)}
              />
            </label>
            <div>
              <button
                type="button"
                className="note-cancel"
                onClick={() => setNotePosition(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="note-add"
                disabled={!noteText.trim()}
              >
                Add note
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
