import type { PdfAnnotation } from './PdfAnnotationLayer'

export type HistoryFileKind = 'pdf' | 'docx' | 'image'

export type HistoryEdits = {
  docxHtml: string
  docxDirty: boolean
  pdfAnnotations: PdfAnnotation[]
  brightness: number
  contrast: number
  rotation: number
  imageDirty: boolean
}

export type HistoryEntry = {
  id: string
  name: string
  kind: HistoryFileKind
  size: number
  lastOpened: number
  original: Blob
  editedExport?: Blob
  editedExportName?: string
  docxHtml?: string
  docxDirty?: boolean
  pdfAnnotations?: PdfAnnotation[]
  brightness?: number
  contrast?: number
  rotation?: number
  imageDirty?: boolean
}

export function updateHistoryEntry(
  entry: HistoryEntry,
  file: File,
  kind: HistoryFileKind,
  edits: HistoryEdits,
): HistoryEntry {
  const sameEdits =
    (kind === 'docx' &&
      entry.docxHtml === edits.docxHtml &&
      entry.docxDirty === edits.docxDirty) ||
    (kind === 'pdf' &&
      sameAnnotations(entry.pdfAnnotations ?? [], edits.pdfAnnotations)) ||
    (kind === 'image' &&
      entry.brightness === edits.brightness &&
      entry.contrast === edits.contrast &&
      entry.rotation === edits.rotation &&
      entry.imageDirty === edits.imageDirty)

  return {
    ...entry,
    name: file.name,
    kind,
    size: file.size,
    docxHtml: kind === 'docx' ? edits.docxHtml : entry.docxHtml,
    docxDirty: kind === 'docx' ? edits.docxDirty : entry.docxDirty,
    pdfAnnotations:
      kind === 'pdf' ? edits.pdfAnnotations : entry.pdfAnnotations,
    brightness: kind === 'image' ? edits.brightness : entry.brightness,
    contrast: kind === 'image' ? edits.contrast : entry.contrast,
    rotation: kind === 'image' ? edits.rotation : entry.rotation,
    imageDirty: kind === 'image' ? edits.imageDirty : entry.imageDirty,
    editedExport: sameEdits ? entry.editedExport : undefined,
    editedExportName: sameEdits ? entry.editedExportName : undefined,
  }
}

function sameAnnotations(first: PdfAnnotation[], second: PdfAnnotation[]) {
  return (
    first.length === second.length &&
    first.every((annotation, index) => {
      const other = second[index]
      return (
        annotation.id === other.id &&
        annotation.page === other.page &&
        annotation.type === other.type &&
        annotation.x === other.x &&
        annotation.y === other.y &&
        annotation.width === other.width &&
        annotation.height === other.height &&
        annotation.text === other.text
      )
    })
  )
}

const databaseName = 'quiet-reader-history'
const storeName = 'documents'
const databaseVersion = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(
        new Error('Local document history is not available in this browser.'),
      )
      return
    }

    const request = window.indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local history.'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = action(transaction.objectStore(storeName))

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not access local history.'))
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('Local history could not be saved.'),
      )
    transaction.oncomplete = () => database.close()
    transaction.onerror = () =>
      reject(
        transaction.error ?? new Error('Local history could not be saved.'),
      )
  })
}

export function listHistoryEntries() {
  return withStore<HistoryEntry[]>('readonly', (store) => store.getAll()).then(
    (entries) =>
      entries.sort((first, second) => second.lastOpened - first.lastOpened),
  )
}

export function getHistoryEntry(id: string) {
  return withStore<HistoryEntry | undefined>('readonly', (store) =>
    store.get(id),
  )
}

export function saveHistoryEntry(entry: HistoryEntry) {
  return withStore<IDBValidKey>('readwrite', (store) => store.put(entry))
}

export function removeHistoryEntry(id: string) {
  return withStore<undefined>('readwrite', (store) => store.delete(id))
}
