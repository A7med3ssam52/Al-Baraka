# معرض البركة — Al Baraka Showroom

نظام ويب عربي RTL لإدارة وحسابات معرض التكاتك والموتوسيكلات والمركبات.

> **الحالة الحالية:** M0.3 — Supabase وتسجيل الدخول ✅
>
> **المرحلة التالية:** M0.4 — Cloudinary والنشر والمراقبة

## نظرة سريعة

- واجهة عربية RTL متجاوبة للكمبيوتر والموبايل.
- إدارة العملاء والموردين والمخزون والمبيعات والأقساط والتحصيلات.
- خزنة وبنوك ومصروفات وقيود محاسبية وتقارير.
- Supabase للبيانات والمصادقة والصلاحيات.
- Cloudinary للصور والمستندات.
- Vercel للنشر.

## التقنيات

| الطبقة           | التقنية                                             |
| ---------------- | --------------------------------------------------- |
| الواجهة          | React 19 + TypeScript 6 + Vite 8                    |
| التنسيق          | Tailwind CSS 4 + Design Tokens                      |
| المكونات         | Radix UI + مكونات shadcn-style + Lucide             |
| التوجيه          | React Router 7                                      |
| الجودة           | ESLint 10 + Prettier 3                              |
| التحقق من البيئة | Zod 4                                               |
| الخلفية          | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| الملفات          | Cloudinary                                          |
| الاستضافة        | Vercel                                              |

## التشغيل المحلي

### المتطلبات

- Node.js 24 (انظر `.nvmrc`)
- npm 11+

### الخطوات

```bash
npm install
```

أنشئ ملف `.env.local` من القالب:

```powershell
Copy-Item .env.example .env.local
```

ثم املأ القيم الحقيقية، وشغّل التطوير:

```bash
npm run dev
```

> **مهم:** `.env.local` مستثنى من Git. لا تضع Cloudinary API Secret أو Supabase secret/service-role key في أي متغير يبدأ بـ `VITE_`.

## السكربتات

| الأمر                    | الوظيفة                             |
| ------------------------ | ----------------------------------- |
| `npm run dev`            | تشغيل خادم التطوير                  |
| `npm run build`          | فحص الأنواع ثم بناء الإنتاج         |
| `npm run typecheck`      | فحص TypeScript فقط                  |
| `npm run lint`           | تشغيل ESLint                        |
| `npm run lint:fix`       | إصلاح مشاكل ESLint القابلة للإصلاح  |
| `npm run format`         | تنسيق الملفات بـ Prettier           |
| `npm run format:check`   | التحقق من التنسيق دون تعديل         |
| `npm run check`          | Typecheck + Lint + Format check     |
| `npm run preview`        | معاينة بناء الإنتاج محليًا          |
| `npm run supabase:start` | تشغيل Supabase المحلي (Docker)      |
| `npm run supabase:stop`  | إيقاف Supabase المحلي               |
| `npm run db:push`        | تطبيق Migration على المشروع المرتبط |
| `npm run db:reset`       | إعادة بناء قاعدة البيانات المحلية   |
| `npm run db:status`      | عرض حالة Supabase المحلي            |

## إعداد Supabase

- مشروع Supabase الحالي مخصص لبيئة التطوير وفق D-14.
- أضف `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY` إلى `.env.local`.
- لتطبيق Migration من الجهاز، أضف `SUPABASE_DB_URL` إلى `.env.local` (لا يبدأ بـ`VITE_` ولا يُرفع إلى Git)، ثم:

```powershell
$line = Get-Content .env.local | Where-Object { $_ -match '^SUPABASE_DB_URL=' } | Select-Object -First 1
$dbUrl = $line.Substring('SUPABASE_DB_URL='.Length).Trim().Trim('"').Trim("'")
& .\node_modules\.bin\supabase.cmd db push --db-url $dbUrl --include-seed
```

- بديل: `npx supabase link --project-ref <project-ref>` ثم `npm run db:push`.
- في بيئة التطوير فقط، يمكن تعطيل تأكيد البريد من `Authentication → Providers → Email` لإنشاء مستخدم اختبار بسرعة. يجب إعادة تفعيله قبل الإنتاج.
- بيانات المستخدم التجريبي تُحفظ في `.env.local` فقط، ولا تُضاف إلى Git.

## الصفحات الحالية

كل المسارات التالية محمية ما عدا صفحات المصادقة.

| المسار             | الوصف                                                         |
| ------------------ | ------------------------------------------------------------- |
| `/login`           | تسجيل الدخول                                                  |
| `/forgot-password` | طلب رابط استعادة كلمة المرور                                  |
| `/reset-password`  | تعيين كلمة مرور جديدة من رابط الاستعادة                       |
| `/profile`         | الملف الشخصي وتغيير كلمة المرور                               |
| `/`                | لوحة تحكم تجريبية مع مؤشرات وحركة مبيعات وتنبيهات أقساط       |
| `/design-system`   | مرجع حي للألوان والخطوط والأزرار والجداول والنوافذ والتنبيهات |
| `/customers`       | صفحة مؤقتة لوحدة العملاء — M2.1                               |
| `/inventory`       | صفحة مؤقتة لوحدة المخزون — M3.1                               |
| `/sales`           | صفحة مؤقتة لوحدة المبيعات — M4.1                              |
| `/installments`    | صفحة مؤقتة لوحدة الأقساط — M5.1                               |
| `/treasury`        | صفحة مؤقتة لوحدة الخزنة — M6.1                                |
| `/documents`       | صفحة مؤقتة لوحدة المستندات — M7.1                             |
| `/reports`         | صفحة مؤقتة لوحدة التقارير — M8.1                              |
| `/settings`        | صفحة مؤقتة للإعدادات — M1.4                                   |
| `/403`             | صفحة عدم وجود صلاحية                                          |
| `/loading`         | نموذج شاشة التحميل                                            |
| أي مسار آخر        | صفحة 404                                                      |

## الهوية البصرية المؤقتة

- الكحلي الداكن: `#0b1f33`
- الذهبي: `#c8a24a`
- الخلفية الرملية: `#f7f4ec`
- الخط: Cairo
- لا يوجد Dark Mode في الإصدار الأول.
- صفحة `/design-system` هي المرجع البصري الحي حتى اعتماد اللوجو النهائي.

## هيكل المشروع

```text
.
├─ src/
│  ├─ app/              # نقطة التركيب، الراوتر، الصفحات العامة
│  ├─ components/       # مكونات مشتركة (ui / layout)
│  ├─ features/         # ميزات العمل: عملاء، مخزون، مبيعات...
│  ├─ lib/              # إعدادات ومساعدات عامة
│  ├─ styles/           # متغيرات التصميم والأنماط العامة
│  ├─ types/            # الأنواع المشتركة
│  └─ main.tsx
├─ supabase/            # Migrations وSeed وإعدادات Supabase CLI
├─ tracking/            # متابعة المراحل والتغييرات والاختبارات
├─ public/
├─ Requirements.md      # المتطلبات المنظمة
├─ Requirements.txt     # المتطلبات الأصلية
├─ stages.md            # خطة المراحل التنفيذية
└─ ...
```

## بيانات المعرض

| البند           | القيمة                                              |
| --------------- | --------------------------------------------------- |
| الاسم           | معرض البركة — Al Baraka                             |
| الفرع           | فرع صان الحجر                                       |
| الكود الثابت    | `SNH-01`                                            |
| العنوان         | محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة |
| العملة          | `EGP`                                               |
| المنطقة الزمنية | `Africa/Cairo`                                      |

## المتابعة

- `tracking/progress.md` — وصلنا لإيه؟
- `tracking/stages.md` — حالة كل مرحلة.
- `tracking/changes.md` — التغييرات.
- `tracking/tests.md` — الاختبارات.
- `tracking/bugs.md` — الأخطاء.
- `tracking/decisions.md` — القرارات.

## الأمان

- لا تُرفع الأسرار إلى Git.
- الرفع إلى Cloudinary يجب أن يكون عبر توقيع من Edge Function، وليس بمفتاح سري في المتصفح.
- RLS إلزامي على كل جدول قبل استخدامه في الإنتاج.
- أي مفتاح سري تم مشاركته خارج القناة الآمنة يجب إلغاؤه (Revoke) واستبداله.
- التطبيق داخلي وغير مخصص للفهرسة العامة؛ `public/robots.txt` و`noindex` يمنعان الزحف.

## النشر

سيتم ربط Vercel في M0.4. حتى ذلك الحين، التشغيل المحلي هو المرجع.

---

© 2026 معرض البركة — مشروع خاص.
