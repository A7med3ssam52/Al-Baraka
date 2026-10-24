# سجل التغييرات

> كل تغيير في المشروع يُسجل هنا. لا تحذف السطور؛ غيّر الحالة عند الحاجة.

| ID | التاريخ | المرحلة | التغيير | الملفات | الاختبار | الحالة |
|---|---|---|---|---|---|---|
| CHG-001 | 2026-10-24 | M0.0 | تثبيت القرارات الأساسية وبيانات المعرض والفرع، وتحويل الخطة من أيام إلى مراحل تنفيذية | `Requirements.md`, `stages.md`, `tracking/*` | مراجعة يدوية | ✅ |
| CHG-002 | 2026-10-24 | M0.1 | إنشاء مشروع React 19 + TypeScript 6 + Vite 8، وضبط ESLint 10 وPrettier 3 وZod | `package.json`, `package-lock.json`, `index.html`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.nvmrc`, `.gitignore` | `T-M0.1-01` → `T-M0.1-06` | ✅ |
| CHG-003 | 2026-10-24 | M0.1 | إنشاء هيكل `src` والواجهة الأولى RTL وملفات البيئة والتوثيق والتتبع | `src/**`, `.env.example`, `README.md`, `CONTRIBUTING.md`, `.github/pull_request_template.md`, `tracking/*` | `T-M0.1-07` → `T-M0.1-13` | ✅ |
| CHG-004 | 2026-10-24 | M0.1 | استعادة ملفات المتطلبات والمراحل بعد اختفائها من جذر المشروع، وإعادة تطبيق تحويل المراحل | `Requirements.md`, `Requirements.txt`, `stages.md`, `tracking/bugs.md` | مراجعة المحتوى والأحجام + `T-M0.1-01` → `T-M0.1-05` | ✅ |
| CHG-005 | 2026-10-24 | M0.1 | تثبيت الملفات في Git وربط `origin` بمستودع GitHub | `.git/`, `tracking/progress.md` | `T-M0.1-13`, `T-M0.1-14` | 🟨 |
