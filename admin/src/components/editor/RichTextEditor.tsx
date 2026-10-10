import Image from '@tiptap/extension-image'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold, Heading2, Heading3, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Quote, Redo2, Undo2, Unlink, type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { MediaPickerModal } from '@/components/media/MediaPicker'
import { cn } from '@/lib/utils'

function ToolButton({ label, icon: Icon, active, disabled, onClick }: { label: string; icon: LucideIcon; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // giữ tiêu điểm và vùng chọn trong trình soạn thảo
      onClick={onClick}
      className={cn('rounded p-1.5 text-text hover:bg-surface-2 disabled:opacity-40', active && 'bg-surface-2 text-accent')}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

/**
 * Trình soạn thảo văn bản giàu định dạng (TipTap) dùng cho trang nội dung, mô tả sản phẩm, bài viết.
 * Giá trị là HTML. Backend làm sạch HTML khi lưu (HtmlSanitizer), nên đây chỉ là tiện ích nhập liệu, không phải ranh giới bảo mật.
 */
export function RichTextEditor({ value, onChange, placeholder = 'Nhập nội dung...', invalid, id, label }: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  invalid?: boolean
  id?: string
  label?: string
}) {
  const [pickingImage, setPickingImage] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } } }),
      Image,
    ],
    content: value,
    editorProps: {
      attributes: { class: 'rte-content', ...(id ? { id } : {}), role: 'textbox', 'aria-multiline': 'true', 'aria-label': label ?? placeholder, 'data-placeholder': placeholder },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  })

  // Đồng bộ khi giá trị đổi từ bên ngoài (nạp dữ liệu, hoàn tác), tránh ghi đè khi chính người dùng đang gõ.
  useEffect(() => {
    if (editor && value !== (editor.isEmpty ? '' : editor.getHTML())) editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor])

  if (!editor) return <div className="skeleton h-48" />

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Địa chỉ liên kết (bắt đầu bằng http://, https:// hoặc /)', previous ?? 'https://')
    if (url === null) return
    if (url.trim() === '') { editor.chain().focus().unsetLink().run(); return }
    if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(url.trim())) { window.alert('Liên kết phải bắt đầu bằng http://, https://, /, mailto: hoặc tel:'); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className={cn('overflow-hidden rounded-md border bg-surface', invalid ? 'border-danger' : 'border-border focus-within:border-accent')}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2 p-1">
        <ToolButton label="In đậm" icon={Bold} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolButton label="In nghiêng" icon={Italic} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolButton label="Tiêu đề lớn" icon={Heading2} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolButton label="Tiêu đề nhỏ" icon={Heading3} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <ToolButton label="Danh sách chấm" icon={List} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolButton label="Danh sách số" icon={ListOrdered} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolButton label="Trích dẫn" icon={Quote} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolButton label="Chèn liên kết" icon={LinkIcon} active={editor.isActive('link')} onClick={setLink} />
        <ToolButton label="Gỡ liên kết" icon={Unlink} disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()} />
        <ToolButton label="Chèn ảnh từ thư viện" icon={ImageIcon} onClick={() => setPickingImage(true)} />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label="Hoàn tác" icon={Undo2} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <ToolButton label="Làm lại" icon={Redo2} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      </div>
      <EditorContent editor={editor} />
      {pickingImage && (
        <MediaPickerModal
          open
          onClose={() => setPickingImage(false)}
          title="Chèn ảnh"
          onPick={([m]) => editor.chain().focus().setImage({ src: m.url, alt: m.altText ?? '' }).run()}
        />
      )}
    </div>
  )
}
