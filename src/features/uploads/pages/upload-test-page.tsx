import {
  AlertCircle,
  CheckCircle2,
  ImageUp,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  uploadToCloudinary,
  validateImageFile,
  type CloudinaryUploadResult,
} from '@/features/uploads/cloudinary'
import { cn } from '@/lib/utils'

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`
}

export function UploadTestPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<CloudinaryUploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const previewUrlRef = useRef<string | null>(null)

  const updatePreview = (nextFile: File | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }

    const nextUrl = nextFile ? URL.createObjectURL(nextFile) : null
    previewUrlRef.current = nextUrl
    setPreviewUrl(nextUrl)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setResult(null)
    setError(null)

    if (!nextFile) {
      setFile(null)
      updatePreview(null)
      return
    }

    const validationError = validateImageFile(nextFile)
    if (validationError) {
      setFile(null)
      updatePreview(null)
      setError(validationError)
      event.target.value = ''
      return
    }

    setFile(nextFile)
    updatePreview(nextFile)
  }

  const handleUpload = async () => {
    if (!file || uploading) return

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const uploaded = await uploadToCloudinary(file, {
        folder: 'albaraka/staging/uploads',
      })
      setResult(uploaded)
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'حدث خطأ غير متوقع أثناء رفع الصورة.',
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="M0.4"
        title="اختبار الرفع الآمن"
        description="اختبار دورة رفع صورة موقّعة من المتصفح إلى Cloudinary عبر Edge Function، دون تعريض API Secret."
        actions={<Badge variant="warning">بيئة تجريبية</Badge>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>اختر صورة</CardTitle>
              <CardDescription>JPG أو PNG أو WebP — بحد أقصى 8 ميجابايت.</CardDescription>
            </div>
            <ShieldCheck className="size-5 shrink-0 text-accent-strong" />
          </CardHeader>

          <CardContent className="space-y-5">
            <label
              htmlFor="upload-test-file"
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition-colors hover:border-accent hover:bg-accent/5',
                uploading && 'pointer-events-none opacity-60',
              )}
            >
              <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <ImageUp className="size-6" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold">{file ? file.name : 'اضغط لاختيار صورة'}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {file ? formatFileSize(file.size) : 'لن يتم رفع أي ملف قبل الضغط على زر الرفع.'}
                </p>
              </div>
              <input
                id="upload-test-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>

            {previewUrl ? (
              <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                <img
                  src={previewUrl}
                  alt="معاينة الصورة المختارة"
                  className="max-h-80 w-full object-contain"
                />
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="leading-6">{error}</p>
              </div>
            ) : null}

            {result ? (
              <div className="space-y-3 rounded-lg border border-success/20 bg-success/5 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-success">
                  <CheckCircle2 className="size-4" />
                  تم الرفع بنجاح
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Public ID</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs" dir="ltr">
                      {result.publicId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">الحجم</dt>
                    <dd className="mt-0.5 font-bold">{formatFileSize(result.bytes)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">الصيغة</dt>
                    <dd className="mt-0.5 font-bold" dir="ltr">
                      {result.format}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">النوع</dt>
                    <dd className="mt-0.5 font-bold" dir="ltr">
                      {result.resourceType}
                    </dd>
                  </div>
                </dl>
                <a
                  href={result.secureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm font-bold text-primary underline underline-offset-4"
                >
                  فتح الملف على Cloudinary
                </a>
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs leading-5 text-muted-foreground">
              الرفع يتم بتوقيع مؤقت من Edge Function. لا يصل API Secret إلى المتصفح.
            </p>
            <Button onClick={() => void handleUpload()} disabled={!file || uploading}>
              {uploading ? <LoaderCircle className="animate-spin" /> : <UploadCloud />}
              {uploading ? 'جارٍ الرفع...' : 'رفع الصورة'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>كيف يعمل؟</CardTitle>
              <CardDescription>خطوات الرفع الآمن في M0.4.</CardDescription>
            </div>
            <Badge variant="outline">Signed upload</Badge>
          </CardHeader>

          <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </span>
                <span>يتحقق التطبيق من جلسة المستخدم.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </span>
                <span>تطلب Edge Function توقيعًا مؤقتًا من Cloudinary.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </span>
                <span>يرفع المتصفح الصورة مباشرة إلى Cloudinary بالتوقيع.</span>
              </li>
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  4
                </span>
                <span>يعود Public ID وSecure URL لتخزينهما لاحقًا في سجل المستند.</span>
              </li>
            </ol>

            <Separator />

            <div className="rounded-lg bg-muted/50 p-3 text-xs leading-6">
              <p className="font-bold text-foreground">ملاحظة إعداد</p>
              <p className="mt-1">
                يجب ضبط <code dir="ltr">CLOUDINARY_CLOUD_NAME</code> و
                <code dir="ltr">CLOUDINARY_API_KEY</code> و
                <code dir="ltr">CLOUDINARY_API_SECRET</code> في أسرار Supabase Edge Functions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
