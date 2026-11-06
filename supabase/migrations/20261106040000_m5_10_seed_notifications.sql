-- M5.10 — Clear notifications and seed samples of all types for demo.

delete from public.notifications;

insert into public.notifications (
  user_id, branch_id, title, body, notification_type, reference_type, reference_id, is_read, created_at
)
select
  p.id,
  p.branch_id,
  t.title,
  t.body,
  t.notification_type,
  null,
  null,
  t.is_read,
  now() - t.minutes_ago * interval '1 minute'
from public.profiles p
cross join (
  values
    ('قسط ( أحمد محمد ) متأخر', 'القسط #123 مستحق منذ 2026-09-01 — المبلغ 5000 جنيه، المدفوع 2000 جنيه.', 'warning', false, 5),
    ('تم تحصيل قسط بنجاح', 'تم تحصيل قسط العميل محمد علي بقيمة 4500 جنيه بواسطة التحصيل.', 'success', false, 25),
    ('معلومة: تحديث النظام', 'سيتوفر تحديث جديد لصفحة الخزنة والمصروفات والمستندات خلال أيام.', 'info', false, 60),
    ('تنبيه خطأ: انخفاض رصيد الخزنة', 'الخزنة الرئيسية منخفضة أقل من الحد الأدنى. يرجى المراجعة.', 'error', false, 90),
    ('قسط ( سارة خالد ) متأخر', 'القسط #456 مستحق منذ 2026-09-03 — المبلغ 3000 جنيه، المدفوع 0 جنيه.', 'warning', true, 180)
) as t(title, body, notification_type, is_read, minutes_ago)
where p.is_active;
