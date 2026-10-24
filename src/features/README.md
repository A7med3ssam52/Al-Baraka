# features

كل ميزة تملك مكوناتها وخطافاتها وطلباتها وأنواعها المحلية.

```text
features/
├─ auth/
├─ dashboard/
├─ customers/
├─ suppliers/
├─ inventory/
├─ sales/
├─ installments/
├─ treasury/
├─ documents/
├─ reports/
└─ settings/
```

قواعد:

- لا تستورد ميزة من داخل ملفات ميزة أخرى مباشرة؛ استخدم واجهة عامة (`index.ts`) عند الحاجة.
- منطق الوصول إلى البيانات يبقى داخل الميزة، وليس في مكونات العرض.
- المكونات المشتركة العامة تذهب إلى `src/components`.
