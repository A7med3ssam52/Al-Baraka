import { Eye, FileText, Loader2, Paperclip, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/use-auth'
import { formatDate, formatDateTime } from '@/lib/utils'

import {
  createDocument,
  deleteDocument,
  deleteDocumentFile,
  fetchDocumentAccessLogs,
  fetchDocumentFiles,
  fetchDocuments,
  getSecureFileUrl,
  translateDocumentError,
  updateDocument,
  uploadDocumentFile,
} from '../api'
import {
  accessActionLabels,
  documentStatusLabels,
  documentTypeLabels,
  type DocumentAccessLogRecord,
  type DocumentFileRecord,
  type DocumentOwnerType,
  type DocumentRecord,
  type DocumentType,
} from '../types'

interface Props {
  ownerType: DocumentOwnerType
  ownerId: string
  ownerLabel: string
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`
  return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`
}

export function DocumentsPanel({ ownerType, ownerId, ownerLabel }: Props) {
  const { hasPermission } = useAuth()
  const canUpload = hasPermission('documents.upload')
  const canView = hasPermission('documents.view')

  const [documents, setDocuments] = useState<DocumentRecord[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [logsDocument, setLogsDocument] = useState<DocumentRecord | null>(null)

  useEffect(() => {
    if (!canView) return
    let mounted = true
    fetchDocuments(ownerType, ownerId)
      .then((rows) => {
        if (mounted) setDocuments(rows)
      })
      .catch((loadError) => {
        if (mounted) setError(translateDocumentError(loadError))
      })
    return () => {
      mounted = false
    }
  }, [canView, ownerType, ownerId, reloadKey])

  const loading = documents === undefined

  function reload() {
    setReloadKey((key) => key + 1)
  }

  if (!canView) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={FileText}
          title="تبويب المستندات مقفل"
          description="لا تملك صلاحية عرض المستندات. راجع مدير الفرع."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="text-center font-bold">المستندات</h2>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button variant="ghost" size="icon" aria-label="تحديث" onClick={reload}>
            <RefreshCw className="size-4" />
          </Button>
          {canUpload ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> مستند جديد
            </Button>
          ) : null}
        </div>
      </Card>

      {error ? (
        <Card className="p-4 text-sm text-destructive">{error}</Card>
      ) : loading ? (
        <Card className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      ) : documents.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={FileText}
            title={`لا مستندات ${ownerType === 'customer' ? 'لهذا العميل' : 'لهذا المورد'} بعد`}
            description={
              canUpload ? 'ابدأ بمستند جديد وارفع صوره مباشرة.' : 'سيتم إضافة المستندات لاحقًا.'
            }
          />
        </Card>
      ) : (
        <ol className="grid gap-3">
          {documents.map((documentRecord) => (
            <li key={documentRecord.id}>
              <DocumentCard
                documentRecord={documentRecord}
                ownerLabel={ownerLabel}
                canUpload={canUpload}
                onChanged={reload}
                onOpenLogs={setLogsDocument}
              />
            </li>
          ))}
        </ol>
      )}

      <CreateDocumentDialog
        open={createOpen}
        ownerType={ownerType}
        ownerId={ownerId}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false)
          reload()
        }}
      />

      {logsDocument ? (
        <AccessLogDialog record={logsDocument} onClose={() => setLogsDocument(null)} />
      ) : null}
    </div>
  )
}
function DocumentCard({
  documentRecord,
  ownerLabel,
  canUpload,
  onChanged,
  onOpenLogs,
}: {
  documentRecord: DocumentRecord
  ownerLabel: string
  canUpload: boolean
  onChanged: () => void
  onOpenLogs: (record: DocumentRecord) => void
}) {
  const { hasPermission } = useAuth()
  const canDelete = hasPermission('documents.delete')
  const [files, setFiles] = useState<DocumentFileRecord[] | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [busyFileId, setBusyFileId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<DocumentType>('other')
  const [editNotes, setEditNotes] = useState('')
  const [editingSaving, setEditingSaving] = useState(false)

  async function loadFiles() {
    try {
      setFiles(await fetchDocumentFiles(documentRecord.id))
    } catch (loadError) {
      toast.error(translateDocumentError(loadError))
    }
  }

  useEffect(() => {
    let mounted = true
    fetchDocumentFiles(documentRecord.id)
      .then((rows) => {
        if (mounted) setFiles(rows)
      })
      .catch((loadError) => {
        if (mounted) toast.error(translateDocumentError(loadError))
      })
    return () => {
      mounted = false
    }
  }, [documentRecord.id])

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return

    setUploading(true)
    try {
      for (const file of picked) {
        await uploadDocumentFile(documentRecord.id, file)
      }
      await loadFiles()
      onChanged()
      toast.success(`تم رفع ${picked.length} ملفًا إلى المستند.`)
    } catch (uploadError) {
      toast.error(translateDocumentError(uploadError))
    } finally {
      setUploading(false)
    }
  }

  async function openSecureUrl(file: DocumentFileRecord, action: 'view' | 'download') {
    setBusyFileId(file.id)
    try {
      const url = await getSecureFileUrl(documentRecord.id, file.id, action)
      window.open(url, action === 'download' ? '_blank' : '_blank', 'noopener')
    } catch (urlError) {
      toast.error(translateDocumentError(urlError))
    } finally {
      setBusyFileId(null)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `كل ملفات ${documentRecord.doc_number} وسجل وصوله سيُحذفان نهائيًا. تأكيد الحذف؟`,
      )
    ) {
      return
    }
    try {
      await deleteDocument(documentRecord.id)
      onChanged()
      toast.success('تم حذف المستند.')
    } catch (deleteError) {
      toast.error(translateDocumentError(deleteError))
    }
  }

  async function handleDeleteFile(file: DocumentFileRecord) {
    if (!window.confirm('حذف الملف نهائي؟')) return
    try {
      await deleteDocumentFile(file.id)
      await loadFiles()
      onChanged()
      toast.success('تم حذف الملف.')
    } catch (deleteError) {
      toast.error(translateDocumentError(deleteError))
    }
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault()
    setEditingSaving(true)
    try {
      await updateDocument({
        documentId: documentRecord.id,
        title: editTitle,
        docType: editType,
        notes: editNotes,
      })
      toast.success('تم حفظ تعديل المستند.')
      setEditOpen(false)
      onChanged()
    } catch (editError) {
      toast.error(translateDocumentError(editError))
    } finally {
      setEditingSaving(false)
    }
  }

  const filesList = files ?? []

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {documentRecord.doc_number}
            </span>
            <Badge variant={documentRecord.status === 'complete' ? 'success' : 'warning'}>
              {documentStatusLabels[documentRecord.status]}
            </Badge>
            <Badge variant="outline">{documentTypeLabels[documentRecord.doc_type]}</Badge>
          </div>
          <p className="mt-1 font-bold">{documentRecord.title}</p>
          <p className="text-xs text-muted-foreground">
            {ownerLabel} • {formatDateTime(documentRecord.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenLogs(documentRecord)}>
            <Eye className="size-4" /> سجل الوصول
          </Button>
          {canUpload ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditTitle(documentRecord.title)
                setEditType(documentRecord.doc_type)
                setEditNotes(documentRecord.notes ?? '')
                setEditOpen(true)
              }}
            >
              <Pencil className="size-4" /> تعديل
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="حذف المستند"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="size-4 text-destructive" /> حذف
            </Button>
          ) : null}
          {canUpload ? (
            <label className="inline-flex">
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => void handleUpload(event)}
                aria-label="رفع ملفات للمستند"
              />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span className="cursor-pointer">
                  <Paperclip className="size-4" />
                  {uploading ? 'جارٍ الرفع…' : 'إرفاق ملفات'}
                </span>
              </Button>
            </label>
          ) : null}
        </div>
      </div>

      {files === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : filesList.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          لا ملفات بعد. أرفق صورة أو أكثر لهذا المستند.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filesList.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{file.file_name}</p>
                <p className="dir-ltr text-[10px] text-muted-foreground">
                  {file.format.toUpperCase()} • {formatBytes(file.bytes)} •{' '}
                  {formatDate(file.uploaded_at)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`عرض ${file.file_name ?? 'الملف'}`}
                  disabled={busyFileId === file.id}
                  onClick={() => void openSecureUrl(file, 'view')}
                >
                  <Eye className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`تنزيل ${file.file_name ?? 'الملف'}`}
                  disabled={busyFileId === file.id}
                  onClick={() => void openSecureUrl(file, 'download')}
                >
                  <RefreshCw className={`size-4 ${busyFileId === file.id ? 'animate-spin' : ''}`} />
                </Button>
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`حذف ${file.file_name ?? 'الملف'}`}
                    onClick={() => void handleDeleteFile(file)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المستند {documentRecord.doc_number}</DialogTitle>
            <DialogDescription>عدّل العنوان أو النوع أو الملاحظة.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={handleSaveEdit}>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">العنوان *</span>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">النوع</span>
              <Select value={editType} onChange={(e) => setEditType(e.target.value as DocumentType)}>
                <option value="id_card">{documentTypeLabels.id_card}</option>
                <option value="commercial_registry">{documentTypeLabels.commercial_registry}</option>
                <option value="other">{documentTypeLabels.other}</option>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">ملاحظة</span>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={editingSaving}>
                {editingSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CreateDocumentDialog({
  open,
  ownerType,
  ownerId,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  ownerType: DocumentOwnerType
  ownerId: string
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState<DocumentType>('id_card')
  const [notes, setNotes] = useState('')
  const [pickedFiles, setPickedFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setTitle('')
    setDocType('id_card')
    setNotes('')
    setPickedFiles([])
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (title.trim().length < 2) {
      toast.error('عنوان المستند مطلوب (حرفان على الأقل).')
      return
    }

    setSubmitting(true)
    try {
      const created = await createDocument({
        title,
        docType,
        ownerType,
        customerId: ownerType === 'customer' ? ownerId : null,
        supplierId: ownerType === 'supplier' ? ownerId : null,
        notes,
      })

      const targetFiles = pickedFiles
      toast.success(`تم إنشاء المستند ${created.doc_number}.`)

      if (targetFiles.length > 0) {
        for (const file of targetFiles) {
          await uploadDocumentFile(created.id, file)
        }
        toast.success(`تم رفع ${targetFiles.length} ملفًا للمستند.`)
      }

      reset()
      onCreated()
    } catch (submitError) {
      toast.error(translateDocumentError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>مستند جديد</DialogTitle>
          <DialogDescription>
            سيُرقّم المستند تلقائيًا، وترفع الملفات مباشرة بتوقيع آمن.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">عنوان المستند *</span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="مثال: بطاقة الرقم القومي"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">النوع</span>
            <Select
              value={docType}
              onChange={(event) => setDocType(event.target.value as DocumentType)}
            >
              <option value="id_card">{documentTypeLabels.id_card}</option>
              <option value="commercial_registry">{documentTypeLabels.commercial_registry}</option>
              <option value="other">{documentTypeLabels.other}</option>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">الملفات</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setPickedFiles(Array.from(event.target.files ?? []))}
              className="rounded-md border border-input bg-background p-2 text-xs file:me-2"
            />
            <span className="text-[10px] text-muted-foreground">
              JPG / PNG / WebP حتى 8 ميجابايت للصورة، ويمكن اختيار أكثر من ملف.
            </span>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">ملاحظة</span>
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="اختياري"
            />
          </label>
          {pickedFiles.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {pickedFiles.map((file, index) => (
                <Badge key={`${file.name}-${index}`} variant="secondary">
                  {file.name}
                  <button
                    type="button"
                    aria-label={`إزالة ${file.name}`}
                    onClick={() =>
                      setPickedFiles((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ التنفيذ…' : 'إنشاء ورفع'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AccessLogDialog({ record, onClose }: { record: DocumentRecord; onClose: () => void }) {
  const [logs, setLogs] = useState<DocumentAccessLogRecord[] | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetchDocumentAccessLogs(record.id)
      .then((rows) => {
        if (mounted) setLogs(rows)
      })
      .catch((loadError) => {
        if (mounted) setError(translateDocumentError(loadError))
      })
    return () => {
      mounted = false
    }
  }, [record.id])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>سجل الوصول — {record.doc_number}</DialogTitle>
          <DialogDescription>
            كل عرض وتنزيل ومتابعة قائمة للمستند يُسجَّل هنا تلقائيًا.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : logs === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا وصول مسجل بعد لهذا المستند.</p>
        ) : (
          <ol className="max-h-72 space-y-2 overflow-y-auto pe-1">
            {logs.map((log) => (
              <li key={log.id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{accessActionLabels[log.action]}</Badge>
                  <span className="text-muted-foreground">{formatDateTime(log.accessed_at)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}
