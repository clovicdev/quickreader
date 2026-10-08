import {
  ArrowDownToLine,
  Clock3,
  FileImage,
  FileText,
  Trash2,
} from 'lucide-react'
import { downloadBlob, formatFileSize } from './documentFiles'
import type { HistoryEntry } from './history'

type RecentDocumentsProps = {
  entries: HistoryEntry[]
  notice: string
  onOpen: (entry: HistoryEntry) => void
  onRemove: (id: string) => void
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

export default function RecentDocuments({
  entries,
  notice,
  onOpen,
  onRemove,
}: RecentDocumentsProps) {
  return (
    <section className="history-panel" aria-labelledby="history-title">
      <div className="history-heading">
        <div className="history-title-wrap">
          <Clock3 size={15} aria-hidden="true" />
          <h2 id="history-title">Recent documents</h2>
        </div>
        <span>Saved in this browser</span>
      </div>

      {notice && (
        <div className="history-notice" role="status">
          {notice}
        </div>
      )}

      {entries.length ? (
        <div className="history-list">
          {entries.map((entry) => (
            <article className="history-row" key={entry.id}>
              <div
                className={`history-file-icon ${entry.kind}`}
                aria-hidden="true"
              >
                {entry.kind === 'image' ? (
                  <FileImage size={16} />
                ) : (
                  <FileText size={16} />
                )}
              </div>
              <div className="history-file-copy">
                <span className="history-file-name" title={entry.name}>
                  {entry.name}
                </span>
                <span className="history-file-meta">
                  {formatDate(entry.lastOpened)} <span>/</span>{' '}
                  {formatFileSize(entry.size)}
                  {hasSavedEdits(entry) && <em>Edited</em>}
                  {entry.editedExport && <em>Edited copy ready</em>}
                </span>
              </div>
              <div className="history-actions">
                <button className="history-open" onClick={() => onOpen(entry)}>
                  Open &amp; edit
                </button>
                <button
                  className="history-icon-button"
                  aria-label={`Download ${entry.editedExport ? 'edited copy' : 'original'} of ${entry.name}`}
                  title={
                    entry.editedExport
                      ? 'Download edited copy'
                      : 'Download original'
                  }
                  onClick={() =>
                    downloadBlob(
                      entry.editedExport ?? entry.original,
                      entry.editedExportName ?? entry.name,
                    )
                  }
                >
                  <ArrowDownToLine size={15} />
                </button>
                <button
                  className="history-icon-button"
                  aria-label={`Remove ${entry.name} from history`}
                  title="Remove from history"
                  onClick={() => onRemove(entry.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="history-empty">
          Documents you open will be saved here on this browser.
        </p>
      )}
    </section>
  )
}

function hasSavedEdits(entry: HistoryEntry) {
  return Boolean(
    entry.docxDirty ||
      (entry.pdfAnnotations?.length ?? 0) > 0 ||
      entry.imageDirty,
  )
}
