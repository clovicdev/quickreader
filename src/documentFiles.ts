import type { PdfAnnotation } from './PdfAnnotationLayer'

export type FileKind = 'pdf' | 'docx' | 'image'

export type DownloadArtifact = {
  blob: Blob
  name: string
}

const imageExtensions = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'svg',
  'gif',
  'bmp',
  'avif',
]

const docxTags = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'img',
  'span',
  'mark',
  'br',
  'hr',
  'sup',
  'sub',
]

const docxAttributes = [
  'href',
  'src',
  'alt',
  'title',
  'colspan',
  'rowspan',
  'start',
  'width',
  'height',
  'style',
]

export function getFileKind(file: File): FileKind | null {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'pdf'
  if (extension === 'docx') return 'docx'
  return imageExtensions.includes(extension ?? '') ? 'image' : null
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readDocxFile(file: File) {
  const module = await import('mammoth')
  const mammoth = ((module as unknown as { default?: typeof module }).default ??
    module) as typeof module
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      styleMap: ['u => u'],
      ignoreEmptyParagraphs: false,
      externalFileAccess: false,
    },
  )

  const { default: DOMPurify } = await import('dompurify')
  return (
    DOMPurify.sanitize(result.value, {
      ALLOWED_TAGS: docxTags,
      ALLOWED_ATTR: docxAttributes,
      ALLOW_DATA_ATTR: false,
    }) || '<p></p>'
  )
}

export function sanitizeDocxHtml(html: string) {
  return import('dompurify').then(({ default: DOMPurify }) =>
    DOMPurify.sanitize(html, {
      ALLOWED_TAGS: docxTags,
      ALLOWED_ATTR: docxAttributes,
      ALLOW_DATA_ATTR: false,
    }),
  )
}

async function rasterizeWordShapes(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  const shapes = Array.from(
    container.querySelectorAll<HTMLImageElement>('img[alt^="Reader shape:"]'),
  )

  await Promise.all(
    shapes.map(async (shape) => {
      const source = shape.currentSrc || shape.src
      if (!source.startsWith('data:image/svg+xml')) return

      const image = new Image()
      image.src = source
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, image.naturalWidth * 2)
      canvas.height = Math.max(1, image.naturalHeight * 2)
      const context = canvas.getContext('2d')
      if (!context) return

      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      shape.setAttribute('src', canvas.toDataURL('image/png'))
    }),
  )

  return container.innerHTML
}

export async function exportEditedDocx(
  file: File,
  html: string,
): Promise<DownloadArtifact> {
  const [{ default: HtmlToDocx }, safeHtml] = await Promise.all([
    import('@turbodocx/html-to-docx'),
    sanitizeDocxHtml(html),
  ])
  const wordReadyHtml = await rasterizeWordShapes(safeHtml)
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>QuickReader export</title></head><body>${wordReadyHtml}</body></html>`
  const result = await HtmlToDocx(documentHtml, null, {
    title: file.name,
    creator: 'QuickReader',
  })
  const blob =
    result instanceof Blob
      ? result
      : new Blob([result as ArrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })

  return {
    blob,
    name: `${file.name.replace(/\.docx$/i, '')}-edited.docx`,
  }
}

export async function exportAnnotatedPdf(
  file: File,
  annotations: PdfAnnotation[],
): Promise<DownloadArtifact> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdf = await PDFDocument.load(await file.arrayBuffer())
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const accent = rgb(58 / 255, 134 / 255, 1)

  for (const annotation of annotations) {
    const page = pdf.getPage(annotation.page - 1)
    const width = page.getWidth()
    const height = page.getHeight()
    const x = annotation.x * width
    const yFromTop = annotation.y * height

    if (annotation.type === 'highlight') {
      const highlightHeight = (annotation.height ?? 0) * height
      page.drawRectangle({
        x,
        y: height - yFromTop - highlightHeight,
        width: (annotation.width ?? 0) * width,
        height: highlightHeight,
        color: accent,
        opacity: 0.28,
      })
      continue
    }

    const boxWidth = Math.min(220, width - 20)
    const boxHeight = 90
    const boxX = Math.min(Math.max(0, x), Math.max(0, width - boxWidth))
    const boxY = Math.min(
      Math.max(0, height - yFromTop - boxHeight),
      Math.max(0, height - boxHeight),
    )
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: rgb(227 / 255, 230 / 255, 232 / 255),
      borderColor: accent,
      borderWidth: 1,
    })
    page.drawText(annotation.text ?? 'Note', {
      x: boxX + 7,
      y: boxY + boxHeight - 16,
      size: 9,
      font,
      color: rgb(22 / 255, 25 / 255, 27 / 255),
      maxWidth: boxWidth - 14,
      lineHeight: 10,
    })
  }

  const bytes = await pdf.save()
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    name: `${file.name.replace(/\.pdf$/i, '')}-annotated.pdf`,
  }
}

export async function exportAdjustedImage(
  file: File,
  sourceUrl: string,
  adjustments: { brightness: number; contrast: number; rotation: number },
): Promise<DownloadArtifact> {
  const image = new Image()
  image.src = sourceUrl
  await image.decode()

  const angle = ((adjustments.rotation % 360) + 360) % 360
  const swapsSides = angle === 90 || angle === 270
  const canvas = document.createElement('canvas')
  canvas.width = swapsSides ? image.naturalHeight : image.naturalWidth
  canvas.height = swapsSides ? image.naturalWidth : image.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare the image canvas.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%)`
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((angle * Math.PI) / 180)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  const mimeType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ? file.type
    : 'image/png'
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error('The edited image could not be created.')),
      mimeType,
    ),
  )
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]

  return {
    blob,
    name: `${baseName}-edited.${extension}`,
  }
}
