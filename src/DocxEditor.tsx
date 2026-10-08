import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Shapes,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'arrow'
type ShapeFill = 'outline' | 'solid'

type DocxEditorProps = {
  content: string
  editable: boolean
  zoom: number
  onChange: (html: string) => void
}

const imageLimit = 20 * 1024 * 1024

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The image could not be read.'))
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(file)
  })
}

function shapeDataUrl(
  type: ShapeType,
  stroke: string,
  fill: string,
  fillMode: ShapeFill,
) {
  // Keep shapes as SVG in the editor; App rasterizes them for Word export.
  const width = 320
  const height = type === 'line' || type === 'arrow' ? 96 : 180
  const fillOpacity = fillMode === 'solid' ? '1' : '0'
  const shape =
    type === 'rectangle'
      ? `<rect x="4" y="4" width="312" height="172" rx="3" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="4"/>`
      : type === 'ellipse'
        ? `<ellipse cx="160" cy="90" rx="154" ry="84" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="4"/>`
        : type === 'line'
          ? `<path d="M 8 48 H 312" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>`
          : `<path d="M 8 48 H 286 M 258 20 L 286 48 L 258 76" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shape}</svg>`
  return `data:image/svg+xml;base64,${window.btoa(svg)}`
}

export default function DocxEditor({
  content,
  editable,
  zoom,
  onChange,
}: DocxEditorProps) {
  const onChangeRef = useRef(onChange)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [, refreshToolbar] = useState(0)
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle')
  const [shapeFillMode, setShapeFillMode] = useState<ShapeFill>('outline')
  const [shapeStroke, setShapeStroke] = useState('#3A86FF')
  const [shapeFill, setShapeFill] = useState('#D8E1EA')
  const [highlightColor, setHighlightColor] = useState('#FFE680')
  const [imageMessage, setImageMessage] = useState('')
  onChangeRef.current = onChange

  const extensions = useMemo(
    () => [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({
        inline: false,
        allowBase64: true,
        resize: {
          enabled: true,
          directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
          minWidth: 48,
          minHeight: 36,
          alwaysPreserveAspectRatio: true,
        },
      }),
    ],
    [],
  )

  const editor = useEditor({
    extensions,
    content,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'docx-tiptap',
        'aria-label': 'Document text',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: currentEditor }) =>
      onChangeRef.current(currentEditor.getHTML()),
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable, false)
    const refresh = () => refreshToolbar((value) => value + 1)
    editor.on('selectionUpdate', refresh)
    editor.on('transaction', refresh)
    return () => {
      editor.off('selectionUpdate', refresh)
      editor.off('transaction', refresh)
    }
  }, [editor, editable])

  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !editor) return
    if (!file.type.startsWith('image/')) {
      setImageMessage('Choose an image file to insert.')
      return
    }
    if (file.size > imageLimit) {
      setImageMessage('Choose an image smaller than 20 MB.')
      return
    }
    try {
      const src = await fileToDataUrl(file)
      editor
        .chain()
        .focus()
        .setImage({ src, alt: file.name, title: file.name })
        .run()
      setImageMessage('')
    } catch {
      setImageMessage('This image could not be added.')
    }
  }

  function addShape() {
    if (!editor) return
    const src = shapeDataUrl(shapeType, shapeStroke, shapeFill, shapeFillMode)
    const height = shapeType === 'line' || shapeType === 'arrow' ? 96 : 180
    editor
      .chain()
      .focus()
      .setImage({
        src,
        alt: `Reader shape: ${shapeType}`,
        title: shapeType,
        width: 320,
        height,
      })
      .run()
  }

  if (!editor)
    return <div className="editor-loading">Preparing the editor…</div>

  const textStyle = editor.getAttributes('textStyle') as {
    color?: string
    fontFamily?: string
    fontSize?: string
  }
  const activeHeading = [1, 2, 3].find((level) =>
    editor.isActive('heading', { level }),
  )
  const rawSize = textStyle.fontSize ?? '12pt'
  const numericSize =
    Number.parseFloat(rawSize) *
    (rawSize.toLowerCase().endsWith('px') ? 0.75 : 1)
  const currentSize = Number.isFinite(numericSize)
    ? String(Number(numericSize.toFixed(1)))
    : '12'

  return (
    <div className="docx-editor">
      <input
        ref={imageInputRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Choose an image to insert"
        onChange={(event) => void addImage(event)}
      />
      {editable && (
        <div
          className="editor-ribbon"
          role="toolbar"
          aria-label="Document formatting"
        >
          <div className="editor-group">
            <button
              className="editor-tool"
              title="Undo"
              aria-label="Undo"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="editor-tool"
              title="Redo"
              aria-label="Redo"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
            >
              <Redo2 size={16} />
            </button>
          </div>
          <span className="editor-separator" />
          <div className="editor-group editor-select-group">
            <label className="editor-style-label">
              <span className="sr-only">Text style</span>
              <select
                aria-label="Text style"
                value={activeHeading ? `h${activeHeading}` : 'paragraph'}
                onChange={(event) => {
                  const value = event.target.value
                  if (value.startsWith('h'))
                    editor
                      .chain()
                      .focus()
                      .toggleHeading({
                        level: Number(value.slice(1)) as 1 | 2 | 3,
                      })
                      .run()
                  else editor.chain().focus().setParagraph().run()
                }}
              >
                <option value="paragraph">Normal</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
              </select>
            </label>
            <label className="editor-style-label">
              <span className="sr-only">Font family</span>
              <select
                aria-label="Font family"
                value={textStyle.fontFamily ?? ''}
                onChange={(event) =>
                  event.target.value
                    ? editor
                        .chain()
                        .focus()
                        .setFontFamily(event.target.value)
                        .run()
                    : editor.chain().focus().unsetFontFamily().run()
                }
              >
                <option value="">Font</option>
                <option value="Arial">Arial</option>
                <option value="Aptos">Aptos</option>
                <option value="Calibri">Calibri</option>
                <option value="Cambria">Cambria</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Verdana">Verdana</option>
              </select>
            </label>
            <label className="editor-size-label">
              <span className="sr-only">Font size</span>
              <input
                className="editor-size-input"
                type="number"
                aria-label="Font size in points"
                min="6"
                max="96"
                step="1"
                value={currentSize}
                onChange={(event) => {
                  const size = Number(event.target.value)
                  if (size >= 6 && size <= 96)
                    editor.chain().focus().setFontSize(`${size}pt`).run()
                }}
              />
              <span className="editor-size-unit">pt</span>
            </label>
          </div>
          <span className="editor-separator" />
          <div className="editor-group">
            <button
              className={`editor-tool ${editor.isActive('bold') ? 'active' : ''}`}
              title="Bold"
              aria-label="Bold"
              aria-pressed={editor.isActive('bold')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={16} />
            </button>
            <button
              className={`editor-tool ${editor.isActive('italic') ? 'active' : ''}`}
              title="Italic"
              aria-label="Italic"
              aria-pressed={editor.isActive('italic')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={16} />
            </button>
            <button
              className={`editor-tool ${editor.isActive('underline') ? 'active' : ''}`}
              title="Underline"
              aria-label="Underline"
              aria-pressed={editor.isActive('underline')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <Underline size={16} />
            </button>
            <button
              className={`editor-tool ${editor.isActive('strike') ? 'active' : ''}`}
              title="Strikethrough"
              aria-label="Strikethrough"
              aria-pressed={editor.isActive('strike')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough size={16} />
            </button>
          </div>
          <div className="editor-group editor-color-group">
            <label className="editor-color-control" title="Text color">
              <span aria-hidden="true">A</span>
              <input
                type="color"
                aria-label="Text color"
                value={textStyle.color ?? '#242628'}
                onChange={(event) =>
                  editor.chain().focus().setColor(event.target.value).run()
                }
              />
            </label>
            <button
              className={`editor-tool ${editor.isActive('highlight') ? 'active' : ''}`}
              title="Highlight selected text"
              aria-label="Highlight selected text"
              aria-pressed={editor.isActive('highlight')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .toggleHighlight({ color: highlightColor })
                  .run()
              }
            >
              <Highlighter size={16} />
            </button>
            <label
              className="editor-color-control editor-highlight-color"
              title="Highlight color"
              style={{ backgroundColor: highlightColor }}
            >
              <span className="sr-only">Highlight color</span>
              <input
                type="color"
                aria-label="Highlight color"
                value={highlightColor}
                onChange={(event) => setHighlightColor(event.target.value)}
              />
            </label>
          </div>
          <span className="editor-separator" />
          <div className="editor-group">
            <button
              className={`editor-tool ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
              title="Align left"
              aria-label="Align left"
              aria-pressed={editor.isActive({ textAlign: 'left' })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            >
              <AlignLeft size={16} />
            </button>
            <button
              className={`editor-tool ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
              title="Align center"
              aria-label="Align center"
              aria-pressed={editor.isActive({ textAlign: 'center' })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor.chain().focus().setTextAlign('center').run()
              }
            >
              <AlignCenter size={16} />
            </button>
            <button
              className={`editor-tool ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
              title="Align right"
              aria-label="Align right"
              aria-pressed={editor.isActive({ textAlign: 'right' })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            >
              <AlignRight size={16} />
            </button>
          </div>
          <span className="editor-separator" />
          <div className="editor-group">
            <button
              className={`editor-tool ${editor.isActive('bulletList') ? 'active' : ''}`}
              title="Bulleted list"
              aria-label="Bulleted list"
              aria-pressed={editor.isActive('bulletList')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={16} />
            </button>
            <button
              className={`editor-tool ${editor.isActive('orderedList') ? 'active' : ''}`}
              title="Numbered list"
              aria-label="Numbered list"
              aria-pressed={editor.isActive('orderedList')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={16} />
            </button>
            <button
              className="editor-tool"
              title="Insert a 3 × 3 table"
              aria-label="Insert a 3 by 3 table"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              }
            >
              <Table2 size={16} />
            </button>
            <button
              className="editor-tool"
              title="Insert a horizontal rule"
              aria-label="Insert a horizontal rule"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus size={16} />
            </button>
          </div>
          <span className="editor-separator" />
          <div className="editor-group editor-insert-group">
            <button
              className="editor-tool"
              title="Insert an image"
              aria-label="Insert an image"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus size={16} />
            </button>
            <button
              className="editor-tool"
              title={
                editor.isActive('link')
                  ? 'Remove link'
                  : 'Add link to selected text'
              }
              aria-label={
                editor.isActive('link')
                  ? 'Remove link'
                  : 'Add link to selected text'
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (editor.isActive('link'))
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .unsetLink()
                    .run()
                else {
                  const href = window.prompt('Link address (include https://)')
                  if (href) editor.chain().focus().setLink({ href }).run()
                }
              }}
            >
              {editor.isActive('link') ? (
                <Unlink size={16} />
              ) : (
                <Link2 size={16} />
              )}
            </button>
            <label className="editor-shape-label">
              <span className="sr-only">Shape type</span>
              <select
                aria-label="Shape type"
                value={shapeType}
                onChange={(event) =>
                  setShapeType(event.target.value as ShapeType)
                }
              >
                <option value="rectangle">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="line">Line</option>
                <option value="arrow">Arrow</option>
              </select>
            </label>
            <label className="editor-shape-label">
              <span className="sr-only">Shape fill style</span>
              <select
                aria-label="Shape fill style"
                value={shapeFillMode}
                onChange={(event) =>
                  setShapeFillMode(event.target.value as ShapeFill)
                }
              >
                <option value="outline">Outline</option>
                <option value="solid">Solid fill</option>
              </select>
            </label>
            <label
              className="editor-color-control shape-color-control"
              title="Shape outline color"
            >
              <span className="sr-only">Shape outline color</span>
              <input
                type="color"
                aria-label="Shape outline color"
                value={shapeStroke}
                onChange={(event) => setShapeStroke(event.target.value)}
              />
            </label>
            <label
              className="editor-color-control shape-color-control"
              title="Shape fill color"
            >
              <span className="sr-only">Shape fill color</span>
              <input
                type="color"
                aria-label="Shape fill color"
                value={shapeFill}
                onChange={(event) => setShapeFill(event.target.value)}
              />
            </label>
            <button
              className="editor-tool editor-shape-button"
              title="Insert a resizable shape; Word exports it as an image"
              aria-label="Insert selected shape; exported as an image"
              onMouseDown={(event) => event.preventDefault()}
              onClick={addShape}
            >
              <Shapes size={16} />
            </button>
            {editor.isActive('image') && (
              <button
                className="editor-tool"
                title="Delete selected image or shape"
                aria-label="Delete selected image or shape"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.chain().focus().deleteSelection().run()}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {imageMessage && (
            <span className="editor-status" role="status">
              {imageMessage}
            </span>
          )}
          <div className="editor-ribbon-hint">
            Select text or a picture to edit it. Resize images and shapes;
            shapes export as images.
          </div>
        </div>
      )}
      <div
        className={`docx-page-wrap editor-page ${editable ? 'is-editable' : ''}`}
        style={{ transform: `scale(${zoom / 100})` }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
