# لوحة تقدم المشروع

> آخر تحديث: 24 أكتوبر 2026 — إغلاق M1.1
>
> المرجع: `../stages.md` و`stages.md`

## الحالة الحالية

| البند | القيمة |
|---|---|
| المرحلة الرئيسية | M1 — الأمان والصلاحيات والبيانات الأساسية |
| المرحلة الحالية | M1.2 — تفعيل RLS ومصفوفة الصلاحيات |
| حالة المرحلة | ✅ M1.1 مكتمل — M1.2 التالي |
| آخر مرحلة مكتملة | M1.1 — تصميم الجداول الأساسية |
| العائق الحالي | لا يوجد عائق تقني. مطلوب تدوير الأسرار المكشوفة أمنيًا: Cloudinary API Secret وPAT وSupabase secret key |
| الخطوة التالية | بدء M1.2: تفعيل سياسات RLS على الجداول الجديدة، وبذر الصلاحيات ومصفوفة الأدوار، ودوال `has_permission` و`is_branch_member` |

## تقدم المراحل الرئيسية

| المرحلة | النطاق | المكتمل | الإجمالي | الحالة |
|---|---|---:|---:|---|
| M0 — التأسيس | M0.0 → M0.4 | 5 | 5 | ✅ |
| M1 — الأمان والصلاحيات | M1.1 → M1.5 | 1 | 5 | 🟨 |
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

## معيار إنجاز M0.4

- [x] ضبط `CLOUDINARY_CLOUD_NAME` و`CLOUDINARY_API_KEY` و`CLOUDINARY_API_SECRET` و`APP_ENV=staging` في Edge Function secrets.
- [x] نشر Edge Function `cloudinary-sign` مع `verify_jwt=true` عبر `--use-api`.
- [x] التحقق من CORS: `OPTIONS` = 200 و`Access-Control-Allow-Origin=*`.
- [x] التحقق من رفض الزائر: `POST` بدون Authorization = 401.
- [x] التحقق من وصول المستخدم المسجل: `POST` مع JWT = 200 وتوقيع مؤقت بعد ضبط السر.
- [x] إنشاء عميل الرفع `uploadToCloudinary` والتحقق من نوع/حجم الصورة.
- [x] إنشاء مسار محمي `/upload-test` وربطه من صفحة الملف الشخصي.
- [x] إضافة GitHub Actions CI (`npm ci` + `npm run check` + `npm run build`).
- [x] نجاح GitHub Actions CI على `main` بعد Push.
- [x] إضافة `vercel.json` لإعادة توجيه SPA.
- [x] نجاح `npm run check` و`npm run build`.
- [x] اختبار رفع صورة فعلي من سطح المكتب: Edge Function 200 + Cloudinary 200 + Secure URL + Public ID.
- [x] اختبار رفع صورة فعلي من الموبايل 390×844: نجاح + لا تجاوز أفقي + لا أخطاء Console.
- [x] تسليم إعداد Vercel (`vercel.json`)؛ النشر والتحقق النهائي مسؤولية المستخدم (D-17).
- [x] تأجيل المراقبة (Sentry) إلى M9 بقرار موثق (D-17) مع Error Boundary وlogs مؤقتًا.
- [x] إغلاق M0.4 وتحديث التتبع النهائي.

> ملاحظة: تم إثبات الرفع الموقّع end-to-end. الصور التجريبية محفوظة في `albaraka/staging/uploads` ويمكن حذفها من Cloudinary. الأسرار التي ظهرت في سجل الشات يجب تدويرها قبل الإنتاج.

## معيار إنجاز M1.1

- [x] إنشاء `roles` و`permissions` و`role_permissions` و`user_roles` مع ربط الدور بالفرع.
- [x] إنشاء `user_branches` و`number_sequences`، وتحويل `app_settings` إلى `system_settings` دون فقدان البيانات.
- [x] إنشاء `audit_logs` و`accounts` و`cashboxes` و`bank_accounts` و`cash_transactions` و`journal_entries` و`journal_entry_lines`.
- [x] توحيد `id` و`created_at` و`updated_at` و`created_by` و`updated_by` في 16 جدولًا (80/80 عمودًا).
- [x] إضافة 26 مفتاحًا أجنبيًا وقيود التكامل وفهارس البحث الأساسية.
- [x] تطبيق Migration `20261024220000_m1_1_core_schema.sql` على مشروع التطوير وتسجيلها في تاريخ Migrations.
- [x] بذر 7 أدوار (owner + 6 تشغيلية) و23 حسابًا وخزنة رئيسية و6 تسلسلات مستندات.
- [x] بذر `system_settings` بالعنوان والهاتف وبادئات المستندات.
- [x] ترحيل المستخدم الحالي إلى `user_branches` و`user_roles` مع دور primary وفرع default.
- [x] تحديث `handle_new_user` لإنشاء profile + branch membership + viewer role.
- [x] حماية كود `SNH-01` من التعديل أو الحذف عبر Trigger.
- [x] تفعيل RLS على 16 جدولًا بنظام المنع الافتراضي، مع قراءة `system_settings` للمستخدم المسجل فقط.
- [x] التحقق من منع الوصول إلى `roles` دون سياسة، ونجاح قراءة `system_settings` للمستخدم المسجل.
- [x] التحقق من قيد القيد المحاسبي غير المتوازن، وقيد حركة الخزنة بدون حساب.
- [x] نجاح إعادة تطبيق Migration و`seed.sql` دون أخطاء (idempotent).
- [x] نجاح `npm run check` و`npm run build`.
- [x] نجاح GitHub Actions CI بعد Push — commit `faded8f`.

> ملاحظات M1.1:
>
> - `permissions` و`role_permissions` فارغتان عمدًا؛ تُبذر المصفوفة في M1.2.
> - `profiles.role` و`profiles.branch_id` محفوظان للتوافق مع الواجهة الحالية حتى M1.3 (D-18)، و`user_roles`/`user_branches` هما المصدر الجديد.
> - الدليل المحاسبي المبدئي (23 حسابًا) يُراجع مع المحاسب قبل M6.6 (O-04).
> - لم يتوفر Docker لاختبار قاعدة محلية معزولة؛ تم التحقق من التسلسل M0.3 → M1.1 على مشروع التطوير، ونجحت إعادة التطبيق.

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
| 2026-10-24 | ضبط `CLOUDINARY_API_SECRET` في Edge secrets والتحقق من استجابة التوقيع 200 بدل `cloudinary_not_configured` |
| 2026-10-24 | نجاح الرفع الموقّع end-to-end من `/upload-test` على سطح المكتب و390×844: Edge Function 200 + Cloudinary 200 + Secure URL، بلا أخطاء Console |
| 2026-10-24 | إغلاق M0.4: تسليم `vercel.json` (النشر مسؤولية المستخدم) وتأجيل Sentry إلى M9 (D-17) |
| 2026-10-24 | نجاح GitHub Actions CI على commit `1fe0bad` (npm ci + check + build) |
| 2026-10-24 | بدء M1.1: تصميم 16 جدولًا للأدوار والصلاحيات والفروع والإعدادات والترقيم وسجل المراجعة والدليل المحاسبي والخزائن والبنوك والقيود |
| 2026-10-24 | تطبيق Migration `20261024220000_m1_1_core_schema.sql` على مشروع التطوير وتسجيل M0.3 وM1.1 في تاريخ Migrations |
| 2026-10-24 | بذر 7 أدوار و23 حسابًا وخزنة رئيسية و6 تسلسلات، وترحيل المستخدم الحالي إلى `user_roles` و`user_branches`، وتحديث `handle_new_user` |
| 2026-10-24 | التحقق من 16 جدولًا و80 عمودًا قياسيًا و26 مفتاحًا أجنبيًا وRLS على 16/16، ونجاح Trigger المستخدم الجديد وحماية `SNH-01` وقيود القيود والخزنة |
| 2026-10-24 | نجاح `npm run check` و`npm run build` وإعادة تطبيق Migration و`seed.sql`؛ اكتمال فحوصات M1.1 المحلية |
| 2026-10-24 | نجاح GitHub Actions CI على commit `faded8f` (npm ci + check + build) وإغلاق M1.1 |
