import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlignLeft,
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileText,
  FileUp,
  FolderOpen,
  Highlighter,
  House,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  StickyNote,
  X,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useDropzone } from 'react-dropzone'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import PdfAnnotationLayer, {
  type PdfAnnotation,
  type PdfTool,
} from './PdfAnnotationLayer'
import RecentDocuments from './RecentDocuments'
import {
  downloadBlob,
  exportAdjustedImage,
  exportAnnotatedPdf,
  exportEditedDocx,
  formatFileSize,
  getFileKind,
  readDocxFile,
  sanitizeDocxHtml,
  type FileKind,
} from './documentFiles'
import {
  getHistoryEntry,
  listHistoryEntries,
  removeHistoryEntry,
  saveHistoryEntry,
  updateHistoryEntry,
  type HistoryEntry,
} from './history'
type ReactPdfModule = typeof import('react-pdf')

const RichDocxEditor = lazy(() => import('./DocxEditor'))

const accept = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/avif': ['.avif'],
}

const ease = [0.22, 1, 0.36, 1] as const

function ThumbnailPage({
  pageNumber,
  PageComponent,
}: {
  pageNumber: number
  PageComponent: ReactPdfModule['Page']
}) {
  const [visible, setVisible] = useState(false)
  const thumbnailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = thumbnailRef.current
    if (!node || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true)
      },
      { root: node.closest('.sidebar-scroll'), rootMargin: '100px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={thumbnailRef} className="thumbnail-preview">
      {visible && (
        <PageComponent
          pageNumber={pageNumber}
          width={105}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      )}
    </div>
  )
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<FileKind | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stageWidth, setStageWidth] = useState(900)
  const [pdfComponents, setPdfComponents] = useState<ReactPdfModule | null>(
    null,
  )
  const [docxHtml, setDocxHtml] = useState('')
  const [docxDirty, setDocxDirty] = useState(false)
  const [docxEditing, setDocxEditing] = useState(false)
  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotation[]>([])
  const [pdfEditing, setPdfEditing] = useState(false)
  const [pdfTool, setPdfTool] = useState<PdfTool>('highlight')
  const [imageEditing, setImageEditing] = useState(false)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [imageDirty, setImageDirty] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [historyNotice, setHistoryNotice] = useState('')
  const restoredDocxRef = useRef<{
    file: File
    html: string
    dirty: boolean
  } | null>(null)
  const imageActions = useRef<{
    zoomIn: () => void
    zoomOut: () => void
    reset: () => void
  } | null>(null)
  const stageRef = useRef<HTMLElement>(null)
  const inputOpenRef = useRef<(() => void) | null>(null)
  const reduceMotion = useReducedMotion()
  const objectUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )
  const historyEdits = useMemo(
    () => ({
      docxHtml,
      docxDirty,
      pdfAnnotations,
      brightness,
      contrast,
      rotation,
      imageDirty,
    }),
    [
      docxHtml,
      docxDirty,
      pdfAnnotations,
      brightness,
      contrast,
      rotation,
      imageDirty,
    ],
  )
  const motionDuration = reduceMotion ? 0 : 0.42

  const refreshHistory = useCallback(async () => {
    try {
      setHistoryEntries(await listHistoryEntries())
      setHistoryNotice('')
    } catch {
      setHistoryNotice('Local history is unavailable in this browser.')
    }
  }, [])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    if (!historyId || !file || !kind || loading) return
    const timeout = window.setTimeout(() => {
      void getHistoryEntry(historyId)
        .then((entry) => {
          if (!entry) return
          return saveHistoryEntry(
            updateHistoryEntry(entry, file, kind, historyEdits),
          )
        })
        .then(() => refreshHistory())
        .catch(() =>
          setHistoryNotice(
            'This document could not be saved to local history.',
          ),
        )
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [historyId, file, kind, loading, historyEdits, refreshHistory])

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  useEffect(() => {
    function closeSidebarOnNarrowScreens() {
      if (window.innerWidth <= 760) setSidebarOpen(false)
    }
    window.addEventListener('resize', closeSidebarOnNarrowScreens)
    return () =>
      window.removeEventListener('resize', closeSidebarOnNarrowScreens)
  }, [])

  useEffect(() => {
    if (kind !== 'pdf' || pdfComponents) return
    let active = true
    import('react-pdf')
      .then((module) => {
        module.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        if (active) setPdfComponents(module)
      })
      .catch(() => {
        if (active) {
          setError(
            'The PDF reader could not be loaded. Refresh the page and try again.',
          )
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [kind, pdfComponents])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) =>
      setStageWidth(entry.contentRect.width),
    )
    observer.observe(stage)
    return () => observer.disconnect()
  }, [file, kind])

  function hasUnsavedChanges() {
    return docxDirty || pdfAnnotations.length > 0 || imageDirty
  }

  const openFile = useCallback(
    (nextFile: File, historyEntry?: HistoryEntry) => {
      const nextKind = getFileKind(nextFile)
      if (!nextKind) {
        setError('Choose a PDF, DOCX, or image file to open.')
        return
      }
      if (
        file &&
        hasUnsavedChanges() &&
        !window.confirm(
          'You have edits that have not been downloaded. Open another file and discard them?',
        )
      )
        return
      setError('')
      setPage(1)
      setPageCount(0)
      setZoom(100)
      const savedDocxHtml = historyEntry?.docxHtml ?? ''
      restoredDocxRef.current = savedDocxHtml
        ? {
            file: nextFile,
            html: savedDocxHtml,
            dirty: historyEntry?.docxDirty ?? false,
          }
        : null
      setDocxHtml('')
      setDocxDirty(historyEntry?.docxDirty ?? false)
      setDocxEditing(nextKind === 'docx')
      setPdfAnnotations(historyEntry?.pdfAnnotations ?? [])
      setPdfEditing(nextKind === 'pdf')
      setPdfTool('highlight')
      setImageEditing(nextKind === 'image')
      setBrightness(historyEntry?.brightness ?? 100)
      setContrast(historyEntry?.contrast ?? 100)
      setRotation(historyEntry?.rotation ?? 0)
      setImageDirty(historyEntry?.imageDirty ?? false)
      setLoading(true)
      setKind(nextKind)
      setFile(nextFile)

      const activeHistoryId = historyEntry?.id ?? crypto.randomUUID()
      setHistoryId(activeHistoryId)
      const nextEntry: HistoryEntry = historyEntry
        ? { ...historyEntry, lastOpened: Date.now() }
        : {
            id: activeHistoryId,
            name: nextFile.name,
            kind: nextKind,
            size: nextFile.size,
            lastOpened: Date.now(),
            original: nextFile,
            pdfAnnotations: [],
            brightness: 100,
            contrast: 100,
            rotation: 0,
            docxDirty: false,
            imageDirty: false,
          }
      void saveHistoryEntry(nextEntry)
        .then(() => refreshHistory())
        .catch(() =>
          setHistoryNotice(
            'This document could not be saved to local history.',
          ),
        )
    },
    [file, kind, docxDirty, pdfAnnotations.length, imageDirty, refreshHistory],
  )

  const openHistoryEntry = useCallback(
    async (entry: HistoryEntry) => {
      try {
        const savedEntry = await getHistoryEntry(entry.id)
        if (!savedEntry) {
          await refreshHistory()
          return
        }
        const restoredFile = new File([savedEntry.original], savedEntry.name, {
          type: savedEntry.original.type,
          lastModified: savedEntry.lastOpened,
        })
        openFile(restoredFile, savedEntry)
      } catch {
        setHistoryNotice('This saved document could not be opened.')
      }
    },
    [openFile, refreshHistory],
  )

  async function deleteHistoryEntry(id: string) {
    try {
      await removeHistoryEntry(id)
      await refreshHistory()
    } catch {
      setHistoryNotice('This history item could not be removed.')
    }
  }

  async function persistCurrentHistory() {
    if (!historyId || !file) return
    try {
      const entry = await getHistoryEntry(historyId)
      if (!entry) return
      if (!kind) return
      await saveHistoryEntry(
        updateHistoryEntry(entry, file, kind, historyEdits),
      )
      await refreshHistory()
    } catch {
      setHistoryNotice('This document could not be saved to local history.')
    }
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) openFile(acceptedFiles[0])
    },
    [openFile],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop,
    onDropRejected: () =>
      setError(
        'That file type is not supported. Open a PDF, DOCX, or common image.',
      ),
  })
  inputOpenRef.current = open

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        inputOpenRef.current?.()
      } else if (event.key === 'Escape' && file) {
        closeFile()
      } else if (!typing && kind === 'pdf' && event.key === 'ArrowRight') {
        setPage((value) => Math.min(pageCount || value, value + 1))
      } else if (!typing && kind === 'pdf' && event.key === 'ArrowLeft') {
        setPage((value) => Math.max(1, value - 1))
      } else if (!typing && (event.key === '+' || event.key === '=')) {
        adjustZoom(10)
      } else if (!typing && event.key === '-') {
        adjustZoom(-10)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (kind !== 'docx' || !file) return
    let active = true
    setLoading(true)

    const restored = restoredDocxRef.current
    const savedContent = restored?.file === file ? restored : null
    const content = savedContent
      ? sanitizeDocxHtml(savedContent.html)
      : readDocxFile(file)

    content
      .then((html) => {
        if (!active) return
        setDocxHtml(html)
        setDocxDirty(savedContent?.dirty ?? false)
        setLoading(false)
        if (savedContent) restoredDocxRef.current = null
      })
      .catch(() => {
        if (active) {
          setError(
            savedContent
              ? 'The saved edits could not be restored safely.'
              : 'This DOCX could not be opened. Try saving it again as a .docx file.',
          )
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [file, kind])

  function closeFile() {
    if (
      hasUnsavedChanges() &&
      !window.confirm(
        'You have edits that have not been downloaded. Go home? This browser keeps them in recent documents so you can return to them.',
      )
    )
      return
    void persistCurrentHistory()
    setFile(null)
    setKind(null)
    setHistoryId(null)
    setError('')
    setPage(1)
    setPageCount(0)
    setZoom(100)
    setLoading(false)
    setDocxHtml('')
    setDocxDirty(false)
    setDocxEditing(false)
    setPdfAnnotations([])
    setPdfEditing(false)
    setImageEditing(false)
    setImageDirty(false)
  }

  function adjustZoom(delta: number) {
    if (kind === 'image') {
      if (delta > 0) imageActions.current?.zoomIn()
      else imageActions.current?.zoomOut()
      return
    }
    setZoom((value) => Math.min(180, Math.max(60, value + delta)))
  }

  function resetZoom() {
    if (kind === 'image') imageActions.current?.reset()
    setZoom(100)
  }

  async function downloadCurrentFile() {
    if (!file || exporting) return
    if (!hasUnsavedChanges() || (kind === 'docx' && !docxDirty)) {
      if (objectUrl) downloadBlob(file, file.name)
      return
    }
    setExporting(true)
    setError('')
    try {
      const artifact =
        kind === 'docx'
          ? await exportEditedDocx(file, docxHtml)
          : kind === 'pdf'
            ? await exportAnnotatedPdf(file, pdfAnnotations)
            : objectUrl
              ? await exportAdjustedImage(file, objectUrl, {
                  brightness,
                  contrast,
                  rotation,
                })
              : null
      if (artifact) {
        downloadBlob(artifact.blob, artifact.name)
        if (historyId) {
          const entry = await getHistoryEntry(historyId)
          if (entry) {
            await saveHistoryEntry({
              ...entry,
              editedExport: artifact.blob,
              editedExportName: artifact.name,
            })
            await refreshHistory()
          }
        }
      }
    } catch {
      setError(
        kind === 'docx'
          ? 'The edited Word file could not be created.'
          : kind === 'pdf'
            ? 'The annotated PDF could not be created. This PDF may be encrypted or use unsupported features.'
            : 'The edited image could not be created. Try a different image format.',
      )
    } finally {
      setExporting(false)
    }
  }

  function onPdfLoaded(document: { numPages: number }) {
    setPageCount(document.numPages)
    setLoading(false)
  }

  const fileTypeLabel =
    kind === 'pdf'
      ? 'PDF document'
      : kind === 'docx'
        ? 'Word document'
        : 'Image'
  const toolbar =
    file && kind ? (
      <motion.header
        className="toolbar"
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: motionDuration, ease }}
      >
        <div className="toolbar-left">
          <button
            className="icon-button home-button"
            aria-label="Go to home and recent documents"
            title="Home"
            onClick={closeFile}
          >
            <House size={17} />
          </button>
          <button
            className="icon-button sidebar-toggle"
            aria-label={sidebarOpen ? 'Hide page sidebar' : 'Show page sidebar'}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            {sidebarOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          <div className="file-heading">
            <span className={`file-type-icon ${kind}`} aria-hidden="true">
              {kind === 'image' ? (
                <FileImage size={16} />
              ) : (
                <FileText size={16} />
              )}
            </span>
            <div className="file-title-block">
              <span className="file-name" title={file.name}>
                {file.name}
              </span>
              <span className="file-meta">
                {fileTypeLabel} <span className="meta-divider">/</span>{' '}
                {formatFileSize(file.size)}
              </span>
            </div>
          </div>
        </div>

        <div className="toolbar-center">
          {kind === 'pdf' && (
            <div className="page-control" aria-label="Page navigation">
              <button
                className="icon-button compact"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={17} />
              </button>
              <label className="page-input-label">
                <span className="sr-only">Current page</span>
                <input
                  aria-label="Current page"
                  inputMode="numeric"
                  value={page}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isFinite(next))
                      setPage(Math.max(1, Math.min(pageCount || 1, next)))
                  }}
                  onBlur={() =>
                    setPage((value) =>
                      Math.max(1, Math.min(pageCount || 1, value)),
                    )
                  }
                />
              </label>
              <span className="page-total">of {pageCount || '—'}</span>
              <button
                className="icon-button compact"
                aria-label="Next page"
                disabled={pageCount > 0 && page >= pageCount}
                onClick={() =>
                  setPage((value) =>
                    Math.min(pageCount || value + 1, value + 1),
                  )
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          {kind !== 'pdf' && (
            <span className="reader-mode">
              {kind === 'docx' ? (
                <>
                  {docxEditing ? <Pencil size={15} /> : <AlignLeft size={15} />}
                  {docxEditing ? ' Editing document' : ' Reading view'}
                </>
              ) : (
                <>Image canvas</>
              )}
            </span>
          )}
        </div>

        <div className="toolbar-right">
          {kind === 'docx' && (
            <button
              className={`mode-button ${docxEditing ? 'mode-active' : ''}`}
              onClick={() => setDocxEditing((value) => !value)}
              aria-label={
                docxEditing ? 'Show reading view' : 'Edit Word document'
              }
              title={docxEditing ? 'Show reading view' : 'Edit document'}
            >
              {docxEditing ? <Check size={15} /> : <Pencil size={15} />}
              <span>{docxEditing ? 'Done' : 'Edit'}</span>
            </button>
          )}
          {kind === 'pdf' && (
            <button
              className={`mode-button ${pdfEditing ? 'mode-active' : ''}`}
              onClick={() => setPdfEditing((value) => !value)}
              aria-label={
                pdfEditing ? 'Finish PDF annotations' : 'Annotate PDF'
              }
              title={pdfEditing ? 'Finish annotating' : 'Annotate PDF'}
            >
              {pdfEditing ? <Check size={15} /> : <Highlighter size={15} />}
              <span>{pdfEditing ? 'Done' : 'Annotate'}</span>
            </button>
          )}
          {kind === 'image' && (
            <button
              className={`mode-button ${imageEditing ? 'mode-active' : ''}`}
              onClick={() => setImageEditing((value) => !value)}
              aria-label={
                imageEditing ? 'Finish image adjustments' : 'Adjust image'
              }
              title={imageEditing ? 'Finish adjusting' : 'Adjust image'}
            >
              {imageEditing ? <Check size={15} /> : <Pencil size={15} />}
              <span>{imageEditing ? 'Done' : 'Adjust'}</span>
            </button>
          )}
          <div className="zoom-control" aria-label="Zoom controls">
            <button
              className="icon-button compact"
              aria-label="Zoom out"
              onClick={() => adjustZoom(-10)}
            >
              <Minus size={16} />
            </button>
            <button
              className="zoom-value"
              aria-label="Reset zoom"
              onClick={resetZoom}
            >
              {kind === 'image' ? `${Math.round(zoom)}%` : `${zoom}%`}
            </button>
            <button
              className="icon-button compact"
              aria-label="Zoom in"
              onClick={() => adjustZoom(10)}
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            className="icon-button download-button"
            onClick={() => void downloadCurrentFile()}
            disabled={exporting}
            aria-label={
              hasUnsavedChanges()
                ? 'Download edited file'
                : 'Download original file'
            }
            title={
              exporting
                ? 'Preparing download…'
                : hasUnsavedChanges()
                  ? 'Download edited file'
                  : 'Download original file'
            }
          >
            <ArrowDownToLine size={17} />
          </button>
          <button
            className="icon-button close-button"
            aria-label="Close document"
            title="Close document"
            onClick={closeFile}
          >
            <X size={18} />
          </button>
        </div>
      </motion.header>
    ) : null

  const shell = (
    <div id="top" className="app-frame" {...getRootProps()}>
      <input {...getInputProps()} />
      {file && kind ? (
        toolbar
      ) : (
        <header className="welcome-toolbar">
          <a className="wordmark" href="#top" aria-label="QuickReader home">
            <img
              className="wordmark-logo"
              src={`${import.meta.env.BASE_URL}quickreader-logo.png`}
              alt=""
            />
          </a>
          <div className="welcome-actions">
            <span className="privacy-note">Files stay on this device</span>
            <button className="open-button" onClick={open}>
              <FolderOpen size={16} /> Open file <kbd>⌘ O</kbd>
            </button>
          </div>
        </header>
      )}

      {file && kind === 'pdf' && pdfEditing && (
        <div
          className="edit-ribbon pdf-tool-ribbon"
          role="toolbar"
          aria-label="PDF annotation tools"
        >
          <div className="ribbon-heading">Annotate PDF</div>
          <div className="ribbon-divider" />
          <button
            className={`ribbon-tool ${pdfTool === 'highlight' ? 'active' : ''}`}
            onClick={() => setPdfTool('highlight')}
            aria-pressed={pdfTool === 'highlight'}
          >
            <Highlighter size={15} /> Highlight
          </button>
          <button
            className={`ribbon-tool ${pdfTool === 'note' ? 'active' : ''}`}
            onClick={() => setPdfTool('note')}
            aria-pressed={pdfTool === 'note'}
          >
            <StickyNote size={15} /> Note
          </button>
          <span className="ribbon-help">
            {pdfTool === 'highlight'
              ? 'Drag over an area to highlight'
              : 'Select a spot on the page to add a note'}
          </span>
          {pdfAnnotations.length > 0 && (
            <div className="ribbon-end-actions">
              <button
                className="text-tool"
                onClick={() => setPdfAnnotations((items) => items.slice(0, -1))}
                aria-label="Undo last annotation"
              >
                Undo
              </button>
              <button
                className="text-tool"
                onClick={() => setPdfAnnotations([])}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {file && kind === 'image' && imageEditing && (
        <div
          className="edit-ribbon image-adjustment-ribbon"
          role="toolbar"
          aria-label="Image adjustments"
        >
          <div className="ribbon-heading">Adjust image</div>
          <div className="ribbon-divider" />
          <div className="rotation-tools">
            <button
              className="ribbon-icon"
              aria-label="Rotate image left"
              title="Rotate left"
              onClick={() => {
                setRotation((value) => value - 90)
                setImageDirty(true)
              }}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="ribbon-icon"
              aria-label="Rotate image right"
              title="Rotate right"
              onClick={() => {
                setRotation((value) => value + 90)
                setImageDirty(true)
              }}
            >
              <RotateCw size={16} />
            </button>
          </div>
          <label className="adjustment-control">
            <span>Brightness</span>
            <input
              type="range"
              min="50"
              max="150"
              value={brightness}
              aria-label="Brightness"
              onChange={(event) => {
                setBrightness(Number(event.target.value))
                setImageDirty(true)
              }}
            />
            <output>{brightness}%</output>
          </label>
          <label className="adjustment-control">
            <span>Contrast</span>
            <input
              type="range"
              min="50"
              max="150"
              value={contrast}
              aria-label="Contrast"
              onChange={(event) => {
                setContrast(Number(event.target.value))
                setImageDirty(true)
              }}
            />
            <output>{contrast}%</output>
          </label>
          {imageDirty && (
            <button
              className="text-tool reset-adjustments"
              onClick={() => {
                setBrightness(100)
                setContrast(100)
                setRotation(0)
                setImageDirty(false)
              }}
            >
              Reset
            </button>
          )}
          <span className="ribbon-help">
            Changes are included in your downloaded copy
          </span>
        </div>
      )}

      {file && kind ? (
        <div className={`reader-layout ${sidebarOpen ? '' : 'sidebar-hidden'}`}>
          <AnimatePresence initial={false}>
            {sidebarOpen && (
              <motion.aside
                className="sidebar"
                initial={reduceMotion ? false : { width: 0, opacity: 0 }}
                animate={{ width: 226, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.32, ease }}
                aria-label="Document pages"
              >
                <div className="sidebar-heading">
                  <span>{kind === 'pdf' ? 'Pages' : 'Document'}</span>
                  {kind === 'pdf' && (
                    <span className="sidebar-count">{pageCount || '—'}</span>
                  )}
                  <button
                    className="mobile-sidebar-close"
                    aria-label="Hide page sidebar"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <PanelLeftClose size={16} />
                  </button>
                </div>
                <div className="sidebar-scroll">
                  {kind === 'pdf' ? (
                    Array.from(
                      { length: pageCount },
                      (_, index) => index + 1,
                    ).map((pageNumber) => (
                      <button
                        className={`thumbnail-row ${pageNumber === page ? 'selected' : ''}`}
                        key={pageNumber}
                        onClick={() => setPage(pageNumber)}
                        aria-current={pageNumber === page ? 'page' : undefined}
                        aria-label={`Go to page ${pageNumber}`}
                      >
                        {pdfComponents && (
                          <div className="thumbnail-paper">
                            <ThumbnailPage
                              pageNumber={pageNumber}
                              PageComponent={pdfComponents.Page}
                            />
                          </div>
                        )}
                        <span className="thumbnail-number">
                          {String(pageNumber).padStart(2, '0')}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="file-outline">
                      <div className="outline-document-icon">
                        {kind === 'docx' ? (
                          <FileText size={17} />
                        ) : (
                          <FileImage size={17} />
                        )}
                      </div>
                      <span className="outline-file-name">{file.name}</span>
                      <span className="outline-file-size">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="sidebar-foot">
                  <span className="keyboard-hint">
                    {kind === 'pdf' ? (
                      <>
                        <kbd>←</kbd>
                        <kbd>→</kbd> navigate <kbd>−</kbd>
                        <kbd>+</kbd> zoom
                      </>
                    ) : (
                      <>
                        Zoom <kbd>−</kbd>
                        <kbd>+</kbd>
                      </>
                    )}
                  </span>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          <main
            ref={stageRef}
            className={`document-stage ${isDragActive ? 'drag-active' : ''}`}
            aria-label="Document viewer"
          >
            {!sidebarOpen && (
              <button
                className="mobile-sidebar-open"
                aria-label="Show page sidebar"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            {loading && (
              <div className="loading-line" aria-label="Loading document">
                <span />
              </div>
            )}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={kind === 'pdf' ? `${file.name}-${page}` : file.name}
                className={`document-viewport ${kind}-viewport ${kind === 'docx' && docxEditing ? 'docx-editing-viewport' : ''}`}
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        y: 10,
                        scale: 0.985,
                        x: kind === 'pdf' ? 8 : 0,
                      }
                }
                animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                exit={
                  reduceMotion
                    ? undefined
                    : { opacity: 0, y: -4, x: kind === 'pdf' ? -8 : 0 }
                }
                transition={{ duration: motionDuration, ease }}
              >
                {kind === 'pdf' && (
                  <div
                    className="pdf-page-wrap"
                    style={{
                      width: `${Math.min(960, Math.max(360, stageWidth - 96))}px`,
                      transform: `scale(${zoom / 100})`,
                    }}
                  >
                    {pdfComponents && (
                      <PdfAnnotationLayer
                        pageNumber={page}
                        annotations={pdfAnnotations}
                        tool={pdfEditing ? pdfTool : 'select'}
                        onAdd={(annotation) =>
                          setPdfAnnotations((items) => [...items, annotation])
                        }
                      >
                        <pdfComponents.Page
                          pageNumber={page}
                          renderTextLayer
                          renderAnnotationLayer
                          width={Math.min(960, Math.max(360, stageWidth - 96))}
                          onRenderSuccess={() => setLoading(false)}
                          onRenderError={() => {
                            setError('This page could not be displayed.')
                            setLoading(false)
                          }}
                        />
                      </PdfAnnotationLayer>
                    )}
                  </div>
                )}
                {kind === 'docx' &&
                  (docxEditing ? (
                    docxHtml ? (
                      <Suspense
                        fallback={
                          <div className="editor-loading" role="status">
                            Preparing the editor…
                          </div>
                        }
                      >
                        <RichDocxEditor
                          content={docxHtml}
                          editable
                          zoom={zoom}
                          onChange={(html) => {
                            setDocxHtml(html)
                            setDocxDirty(true)
                          }}
                        />
                      </Suspense>
                    ) : (
                      <div
                        className="editor-loading"
                        role={error ? 'alert' : 'status'}
                      >
                        {error
                          ? 'The document could not be prepared for editing.'
                          : 'Preparing your document for editing…'}
                      </div>
                    )
                  ) : (
                    <div
                      className="docx-page-wrap docx-read-page"
                      style={{ transform: `scale(${zoom / 100})` }}
                    >
                      <div
                        className="docx-content"
                        dangerouslySetInnerHTML={{ __html: docxHtml }}
                      />
                    </div>
                  ))}
                {kind === 'image' && (
                  <TransformWrapper
                    initialScale={1}
                    minScale={0.4}
                    maxScale={5}
                    centerOnInit
                    wheel={{ step: 0.12 }}
                    doubleClick={{ mode: 'toggle', step: 1.5 }}
                    onTransformed={(_ref, state) => setZoom(state.scale * 100)}
                  >
                    {({ zoomIn, zoomOut, resetTransform }) => {
                      imageActions.current = {
                        zoomIn,
                        zoomOut,
                        reset: resetTransform,
                      }
                      return (
                        <TransformComponent
                          wrapperClass="image-zoom-wrapper"
                          contentClass="image-zoom-content"
                        >
                          <img
                            className="reader-image"
                            src={objectUrl ?? ''}
                            alt={file.name}
                            style={{
                              filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                              transform: `rotate(${rotation}deg)`,
                            }}
                            onLoad={() => setLoading(false)}
                            onError={() => {
                              setError('This image could not be opened.')
                              setLoading(false)
                            }}
                          />
                        </TransformComponent>
                      )
                    }}
                  </TransformWrapper>
                )}
              </motion.div>
            </AnimatePresence>
            {error && (
              <div className="error-notice" role="alert">
                {error}
                <button onClick={() => setError('')} aria-label="Dismiss error">
                  <X size={14} />
                </button>
              </div>
            )}
            {isDragActive && (
              <div className="drop-overlay">
                <div>
                  <FileUp size={25} />
                  <span>Drop to open</span>
                </div>
              </div>
            )}
            {kind === 'pdf' && pageCount > 0 && (
              <div className="stage-counter" aria-live="polite">
                {String(page).padStart(2, '0')} <span>/</span>{' '}
                {String(pageCount).padStart(2, '0')}
              </div>
            )}
          </main>
        </div>
      ) : (
        <main
          ref={stageRef}
          className={`welcome-stage ${historyEntries.length ? 'has-history' : ''} ${isDragActive ? 'drag-active' : ''}`}
          aria-label="Open a document"
        >
          <motion.div
            className="welcome-card"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionDuration, ease }}
          >
            <div className="paper-stack" aria-hidden="true">
              <span className="paper-sheet sheet-back" />
              <span className="paper-sheet sheet-middle" />
              <span className="paper-sheet sheet-front">
                <span />
                <i />
                <i />
                <i />
                <b />
              </span>
            </div>
            <h1>
              A clear place
              <br />
              to read.
            </h1>
            <p>
              Bring a document into focus. Your files stay right here on your
              device.
            </p>
            <button className="open-button primary-open" onClick={open}>
              <FolderOpen size={16} /> Choose a file
            </button>
            <div className="drop-instruction">
              or drop it anywhere in this window
            </div>
            <div className="supported-formats">
              <span>PDF</span>
              <i />
              <span>DOCX</span>
              <i />
              <span>PNG</span>
              <i />
              <span>JPG</span>
              <i />
              <span>SVG</span>
              <i />
              <span>WEBP</span>
            </div>
            {error && (
              <div className="welcome-error" role="alert">
                {error}
              </div>
            )}
          </motion.div>
          <RecentDocuments
            entries={historyEntries}
            notice={historyNotice}
            onOpen={(entry) => void openHistoryEntry(entry)}
            onRemove={(id) => void deleteHistoryEntry(id)}
          />
          {isDragActive && (
            <div className="drop-overlay">
              <div>
                <FileUp size={25} />
                <span>Drop to open</span>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  )

  if (file && kind === 'pdf') {
    if (!pdfComponents)
      return (
        <div className="pdf-loading-screen">
          <div className="loading-line">
            <span />
          </div>
        </div>
      )
    const PdfDocument = pdfComponents.Document
    return (
      <PdfDocument
        file={file}
        onLoadSuccess={onPdfLoaded}
        onLoadError={() => {
          setError(
            'This PDF could not be opened. Check that the file is not damaged or password protected.',
          )
          setLoading(false)
        }}
        loading={
          <div className="pdf-loading-screen">
            <div className="loading-line">
              <span />
            </div>
          </div>
        }
      >
        {shell}
      </PdfDocument>
    )
  }
  return shell
}

export default App
