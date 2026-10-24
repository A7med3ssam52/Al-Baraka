# لوحة تقدم المشروع

> آخر تحديث: 24 أكتوبر 2026 — بدء M0.4
>
> المرجع: `../stages.md` و`stages.md`

## الحالة الحالية

| البند | القيمة |
|---|---|
| المرحلة الرئيسية | M0 — التأسيس وتجهيز البيئة |
| المرحلة الحالية | M0.4 — Cloudinary والنشر والمراقبة |
| حالة المرحلة | 🟨 قيد التنفيذ |
| آخر مرحلة مكتملة | M0.3 — Supabase وتسجيل الدخول |
| العائق الحالي | `CLOUDINARY_API_SECRET` غير موجود في سجل الشات أو `.env.local`؛ مطلوب لاختبار الرفع الفعلي. صلاحية Vercel وSentry مؤجلتان |
| الخطوة التالية | ضبط `CLOUDINARY_API_SECRET` في Edge secrets، اختبار الرفع من `/upload-test`، ثم نشر Vercel والمراقبة وإغلاق M0.4 |

## تقدم المراحل الرئيسية

| المرحلة | النطاق | المكتمل | الإجمالي | الحالة |
|---|---|---:|---:|---|
| M0 — التأسيس | M0.0 → M0.4 | 4 | 5 | 🟨 |
| M1 — الأمان والصلاحيات | M1.1 → M1.5 | 0 | 5 | ⬜ |
| M2 — العملاء والموردون | M2.1 → M2.5 | 0 | 5 | ⬜ |
| M3 — المخزون والمشتريات | M3.1 → M3.8 | 0 | 8 | ⬜ |
| M4 — المبيعات والعقود | M4.1 → M4.8 | 0 | 8 | ⬜ |
| M5 — الأقساط والتحصيلات | M5.1 → M5.7 | 0 | 7 | ⬜ |
| M6 — الخزنة والمحاسبة | M6.1 → M6.8 | 0 | 8 | ⬜ |
| M7 — المستندات والطباعة | M7.1 → M7.6 | 0 | 6 | ⬜ |
| M8 — التقارير والتنبيهات | M8.1 → M8.5 | 0 | 5 | ⬜ |
| M9 — الاختبار والتشغيل | M9.1 → M9.6 | 0 | 6 | ⬜ |

## معيار إنجاز M0.1

- [x] إنشاء مشروع React + TypeScript + Vite.
- [x] ضبط ESLint وPrettier وفحص الأنواع.
- [x] إنشاء هيكل المجلدات الأساسي.
- [x] إنشاء `.env.example` والتحقق من المتغيرات عبر Zod.
- [x] كتابة README.
- [x] إنشاء قالب Pull Request وقواعد التسمية.
- [x] نجاح `npm run check`.
- [x] نجاح `npm run build`.
- [x] تشغيل خادم التطوير والتحقق من الاستجابة.
- [x] أول commit محلي.
- [x] Push إلى GitHub — `origin/main`.

## معيار إنجاز M0.2

- [x] إعداد Tailwind 4 وRadix وبنية shadcn/ui.
- [x] تضمين خط Cairo وضبط RTL والألوان والمسافات والظلال.
- [x] بناء App Shell: Sidebar + Header + Breadcrumbs + Content.
- [x] إنشاء المكونات الأساسية: Button، Input، Table، Card، Dialog، Toast، Skeleton، Empty State، Sheet، Dropdown، Tooltip.
- [x] إنشاء صفحات 403 و404 وLoading.
- [x] إنشاء صفحة Design System تفاعلية.
- [x] ربط React Router ومسارات الوحدات المؤجلة.
- [x] اختبار التجاوب على 390px و768px و1440px دون تجاوز أفقي.
- [x] اختبار Sheet وDialog وToast وTooltip وDropdown.
- [x] نجاح `npm run check` و`npm run build`.
- [x] اجتياز Lighthouse للوصول وأفضل الممارسات وSEO بنتيجة 1.0.
- [x] تحديث التتبع وcommit وPush.

## معيار إنجاز M0.3

- [x] تثبيت `@supabase/supabase-js` وSupabase CLI.
- [x] إنشاء `supabase/config.toml`.
- [x] كتابة Migration أولية: `branches` و`profiles` و`app_settings` مع RLS وtrigger لإنشاء الملف الشخصي.
- [x] كتابة `supabase/seed.sql`.
- [x] إنشاء Supabase client والتحقق من متغيرات البيئة.
- [x] إنشاء `AuthProvider` مع استعادة الجلسة وتجديدها وتحميل الملف الشخصي.
- [x] إنشاء `ProtectedRoute` و`PublicOnlyRoute`.
- [x] إنشاء صفحات الدخول واستعادة كلمة المرور وتعيينها والملف الشخصي.
- [x] ربط الهيدر والسايدبار ببيانات المستخدم وتسجيل الخروج.
- [x] تطبيق Migration على مشروع التطوير.
- [x] إنشاء مستخدم اختبار مؤكد.
- [x] اختبار الدخول والخروج والجلسة وإعادة التوجيه وتغيير كلمة المرور.
- [x] التحقق من RLS وtrigger إنشاء الملف الشخصي.
- [x] اجتياز الفحوصات والبناء وLighthouse وتحديث التتبع ثم commit وPush.

## معيار إنجاز M0.4 (قيد التنفيذ)

- [x] ضبط `CLOUDINARY_CLOUD_NAME` و`CLOUDINARY_API_KEY` و`APP_ENV=staging` في Edge Function secrets.
- [x] نشر Edge Function `cloudinary-sign` مع `verify_jwt=true` عبر `--use-api`.
- [x] التحقق من CORS: `OPTIONS` = 200 و`Access-Control-Allow-Origin=*`.
- [x] التحقق من رفض الزائر: `POST` بدون Authorization = 401.
- [x] التحقق من وصول المستخدم المسجل: `POST` مع JWT = 500 `cloudinary_not_configured` (متوقع حتى ضبط السر).
- [x] إنشاء عميل الرفع `uploadToCloudinary` والتحقق من نوع/حجم الصورة.
- [x] إنشاء مسار محمي `/upload-test` وربطه من صفحة الملف الشخصي.
- [x] إضافة GitHub Actions CI (`npm ci` + `npm run check` + `npm run build`).
- [x] نجاح GitHub Actions CI على `main` بعد Push.
- [x] إضافة `vercel.json` لإعادة توجيه SPA.
- [x] نجاح `npm run check` و`npm run build`.
- [ ] ضبط `CLOUDINARY_API_SECRET` في Edge secrets.
- [ ] اختبار رفع صورة فعلي من سطح المكتب والموبايل.
- [ ] نشر Vercel والتحقق من المسارات المحمية.
- [ ] تفعيل المراقبة (Sentry أو بديل).
- [ ] إغلاق M0.4 وتحديث التتبع النهائي.

> ملاحظة: سجل الشات يحتوي Cloud Name وAPI Key فقط. الـ `sb_secret_...` الموجود هو مفتاح Supabase وليس Cloudinary API Secret. التوقيع لا يعمل بالـ API Key وحده.

## سجل مختصر

| التاريخ | الحدث |
|---|---|
| 2026-10-24 | تثبيت القرارات D-01 → D-11 وتجهيز الحسابات الأساسية (M0.0) |
| 2026-10-24 | إنجاز M0.1: scaffold + tooling + هيكل المشروع + اختبارات البناء |
| 2026-10-24 | استعادة ملفات المتطلبات والمراحل (BUG-001) وإضافتها إلى Git |
| 2026-10-24 | إنجاز M0.2: Design System + App Shell + صفحات 403/404/Loading + اختبار 390/768/1440 — commit `e4bd55a` + Push ناجح |
| 2026-10-24 | إصلاح BUG-002: منع التجاوز الأفقي للبطاقات على الموبايل عبر `min-w-0` |
| 2026-10-24 | توحيد عرض المبالغ والتواريخ بأرقام لاتينية مع تنسيق عربي (D-13) |
| 2026-10-24 | تحسين التباين وإضافة `robots.txt` و`noindex` — Lighthouse 1.0 للوصول وأفضل الممارسات وSEO |
| 2026-10-24 | اعتماد D-14: مشروع Supabase الحالي للتطوير + مستخدم اختبار مؤقت + تعطيل تأكيد البريد في التطوير فقط |
| 2026-10-24 | تنفيذ واجهات M0.3: Supabase client + AuthProvider + حماية المسارات + صفحات الدخول/الاستعادة/الملف الشخصي |
| 2026-10-24 | تطبيق Migration على مشروع التطوير: `branches` و`profiles` و`app_settings` + RLS + trigger + بذر `SNH-01` والإعدادات |
| 2026-10-24 | إنشاء مستخدم اختبار مؤكد وترقيته إلى **مدير المعرض**؛ بياناته في `.env.local` فقط |
| 2026-10-24 | التحقق من RLS وtrigger: الزائر مرفوض، والمستخدم يرى ملفه فقط، والمستخدم الجديد يُنشأ بدور `viewer` وفرع `SNH-01` |
| 2026-10-24 | اجتياز E2E للمصادقة: زائر، دخول، جلسة، تغيير كلمة مرور، خروج، استعادة كلمة مرور، 390px، بلا أخطاء Console |
| 2026-10-24 | إصلاح BUG-004 وBUG-005 وBUG-006؛ Lighthouse: Accessibility 1.0 وBest Practices 1.0 للدخول والملف الشخصي (SEO 0.63 بسبب `noindex` المتعمد) |
| 2026-10-24 | اجتياز `npm run check` و`npm run build` — commit `2b4fd20` + Push ناجح، وإغلاق M0.3 |
| 2026-10-24 | بدء M0.4: نشر `cloudinary-sign` وضبط Cloud Name وAPI Key وAPP_ENV كأسرار Edge Function |
| 2026-10-24 | اختبار Edge Function: OPTIONS 200، زائر 401، مستخدم مسجل 500 `cloudinary_not_configured` — الرفع الفعلي ينتظر `CLOUDINARY_API_SECRET` |
| 2026-10-24 | إضافة عميل الرفع الموقّع ومسار `/upload-test` وCI و`vercel.json`؛ نجاح `npm run check` و`npm run build` |
| 2026-10-24 | نجاح GitHub Actions CI على commit `d83b4b1` (npm ci + check + build) |
