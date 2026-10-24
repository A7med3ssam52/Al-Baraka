# قواعد المساهمة

## سير العمل

1. افتح أول مرحلة غير مكتملة في `tracking/stages.md`.
2. علّمها 🟨 قبل البدء، وسجّل أي عائق في `tracking/progress.md`.
3. أنشئ فرعًا باسم واضح.
4. نفّذ المهام واختبر معيار الإنجاز.
5. افتح Pull Request مع وصف المرحلة ونتائج الاختبار.
6. بعد الدمج، علّم المرحلة ✅ وحدّث `tracking/`.

## تسمية الفروع

| النوع | الصيغة                  | مثال                       |
| ----- | ----------------------- | -------------------------- |
| مرحلة | `stage/Mx.y-short-name` | `stage/M0.2-design-system` |
| ميزة  | `feat/short-name`       | `feat/customer-profile`    |
| إصلاح | `fix/short-name`        | `fix/installment-total`    |
| توثيق | `docs/short-name`       | `docs/tracking-guide`      |
| صيانة | `chore/short-name`      | `chore/eslint-config`      |

## رسائل Commit

استخدم الصيغة:

```text
type(scope): وصف قصير
```

الأنواع المسموحة: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

أمثلة:

```text
feat(sales): add cash sale review step
fix(installments): exclude future installments from overdue
docs(tracking): record M0.1 test results
```

## قواعد الكود

- TypeScript صارم، وتجنّب `any` بدون سبب موثق.
- المكونات `PascalCase`، والملفات `kebab-case` باستثناء ملفات المكونات.
- الخطافات تبدأ بـ `use`.
- لا منطق أعمال داخل مكونات العرض؛ استخدم `features/<feature>`.
- استخدم مسار `@/` بدلًا من مسارات نسبية عميقة.
- حافظ على RTL باستخدام الخصائص المنطقية (`margin-inline`, `inset-inline`...).
- لا تُضف مكتبة جديدة دون تسجيل قرارها في `tracking/decisions.md`.

## قبل فتح Pull Request

- [ ] `npm run check` ينجح.
- [ ] `npm run build` ينجح.
- [ ] تم اختبار الشاشة على الكمبيوتر والموبايل.
- [ ] لا توجد أسرار أو ملفات `.env.local` في التغييرات.
- [ ] تم تحديث `tracking/` إذا كانت المرحلة مكتملة.
- [ ] تم توثيق أي Migration أو قرار جديد.

## الأسرار

- لا تشارك أي مفتاح سري في Git أو المحادثات أو لقطات الشاشة.
- `.env.local` محلي فقط.
- Cloudinary API Secret وSupabase secret key لا يظهران في كود الواجهة أبدًا.
