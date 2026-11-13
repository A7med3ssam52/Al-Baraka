/**
 * Arabic messages for EVERY error code raised by the database (`raise exception`
 * inside the Supabase migrations), plus safe Arabic fallbacks for raw PostgREST /
 * Postgres error text. User-facing errors must never carry technical wording.
 */

export const databaseErrorMessages: Record<string, string> = {
  active_state_required: 'لا يمكن تنفيذ العملية على سجل غير مفعّل — فعّله الأول.',
  bank_account_missing: 'لا يوجد حساب بنكي للفرع — راجع إعدادات الخزنة والحسابات.',
  branch_id_immutable: 'لا يمكن تغيير فرع هذا السجل.',
  branch_out_of_scope: 'هذا الفرع مش ضمن نطاق صلاحياتك.',
  branch_required: 'اختر الفرع أولًا.',
  branches_required: 'اختر فرعًا واحدًا على الأقل.',
  cannot_delete_all_installments: 'لا يمكن حذف كل أقساط العقد — استخدم إلغاء العقد بدلًا من ذلك.',
  cannot_modify_self: 'لا يمكنك تعديل حسابك الخاص من هنا.',
  cashbox_missing: 'لا توجد خزنة لهذا الفرع — راجع إعدادات الخزنة والحسابات.',
  cleanup_aborted_contract_not_draft: 'العملية متوقفة لحماية البيانات (عقد مرتبط).',
  cleanup_aborted_invoice_not_draft: 'العملية متوقفة لحماية البيانات (فاتورة مرتبطة).',
  cleanup_aborted_journals_exist: 'العملية متوقفة لحماية البيانات (قيود مرتبطة).',
  cleanup_aborted_ledger_exists: 'العملية متوقفة لحماية البيانات (قيود عملاء مرتبطة).',
  cleanup_aborted_payments_exist: 'العملية متوقفة لحماية البيانات (تحصيلات مرتبطة).',
  cleanup_aborted_returns_exist: 'العملية متوقفة لحماية البيانات (مرتجعات مرتبطة).',
  cleanup_aborted_vehicle_status: 'العملية متوقفة لحماية البيانات (مركبة مرتبطة).',
  confirmation_mismatch: 'نص التأكيد لا يطابق المطلوب.',
  contact_missing: 'جهة الاتصال غير موجودة أو تم حذفها.',
  contract_already_exists: 'في عقد موجود بالفعل لهذه الفاتورة.',
  contract_has_payments: 'توجد تحصيلات على هذا العقد — استخدم الإعفاء أو إعادة الجدولة.',
  contract_locked: 'العقد ملغى أو لا يمكن تعديله في حالته الحالية.',
  contract_missing: 'العقد غير موجود.',
  contract_not_active: 'لا يمكن تنفيذ العملية إلا على عقد نشط.',
  contract_not_draft: 'العقد ليس في حالة مسودة — لا يمكن تنفيذ العملية.',
  count_already_open: 'في جرد مفتوح بالفعل — أغلقه الأول.',
  count_item_missing: 'بند الجرد غير موجود.',
  count_missing: 'الجرد غير موجود.',
  count_not_draft: 'الجرد ليس في حالة مسودة — لا يمكن تنفيذ العملية.',
  customer_archived: 'العميل مؤرشيف — أعد تفعيله الأول.',
  customer_delete_forbidden: 'لا يمكنك حذف هذا العميل — فيه تعاملات أو صلاحيات مرتبطة.',
  customer_inactive: 'العميل غير نشط — لا يمكن إتمام العملية.',
  customer_missing: 'العميل غير موجود أو خارج نطاق فرعك.',
  cyclic_reference: 'بيانات مرتبطة بشكل دائري — راجع الترتيب.',
  discount_limit_exceeded: 'الخصم أكبر من الحد المسموح.',
  document_file_missing: 'ملف المستند غير موجود.',
  document_mismatch: 'المستند غير مطابق لهذه العملية.',
  document_missing: 'المستند غير موجود.',
  duplicate_barcode: 'الباركود مسجل بالفعل لمنتج آخر.',
  duplicate_chassis: 'رقم الشاسيه مسجل بالفعل لمركبة أخرى.',
  duplicate_customer_code: 'كود العميل مستخدم بالفعل.',
  duplicate_engine: 'رقم الموتور مسجل بالفعل لمركبة أخرى.',
  duplicate_national_id: 'الرقم القومي مسجل بالفعل.',
  duplicate_sale_item: 'نفس المركبة مضافة أكتر من مرة.',
  expense_archived: 'المصروف مؤرشيف.',
  expense_missing: 'المصروف غير موجود.',
  forbidden: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  full_name_required: 'الاسم بالكامل مطلوب.',
  full_name_too_long: 'الاسم طويل جدًا.',
  guarantor_missing: 'الضامن غير موجود.',
  has_history: 'لا يمكن الحذف — لهذا السجل تاريخ مرتبط. استخدم الأرشفة بدلًا منه.',
  identifier_required: 'معرّف مطلوب لإتمام العملية.',
  installment_already_paid: 'هذا القسط مدفوع بالكامل بالفعل.',
  installment_items_count_mismatch: 'عدد صفوف الأقساط لا يطابق عدد الأقساط المحدد في العقد.',
  installment_locked: 'القسط مدفوع أو مسوّى ولا يمكن تعديله أو حذفه.',
  installment_missing: 'القسط غير موجود أو تم حذفه.',
  installment_not_payable: 'هذا القسط مدفوع بالكامل أو مسوى بالفعل.',
  installment_not_reschedulable: 'لا يمكن إعادة جدولة قسط مدفوع أو مسوّى.',
  installment_sum_mismatch: 'مجموع مبالغ الأقساط لازم يساوي المبلغ الممول بالظبط.',
  insufficient_cashbox_balance: 'رصيد الخزنة لا يكفي لتسجيل هذه الحركة.',
  insufficient_stock: 'الرصيد لا يكفي لهذه الحركة.',
  invalid_action: 'العملية المطلوبة غير معروفة.',
  invalid_address: 'العنوان غير صحيح.',
  invalid_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر.',
  invalid_app_name: 'اسم التطبيق غير صحيح.',
  invalid_branch: 'الفرع غير موجود أو غير نشط.',
  invalid_contact_label: 'نوع جهة الاتصال غير معروف.',
  invalid_count_items: 'بنود الجرد غير صحيحة.',
  invalid_count_quantity: 'الكمية في الجرد غير صحيحة.',
  invalid_currency: 'العملة غير معروفة.',
  invalid_custom_days: 'أيام الدورية المخصصة غير صحيحة.',
  invalid_customer_code: 'كود العميل غير صحيح.',
  invalid_customer_name: 'اسم العميل غير صحيح.',
  invalid_default_branch: 'الفرع الافتراضي غير صحيح.',
  invalid_discount_limit: 'حد الخصم غير صحيح.',
  invalid_document_prefix: 'بادئة الأرقام غير صحيحة.',
  invalid_document_prefixes: 'بادئات الأرقام غير صحيحة.',
  invalid_document_title: 'عنوان المستند غير صحيح.',
  invalid_document_type: 'نوع المستند غير صحيح.',
  invalid_down_payment: 'المقدم غير صحيح أو أكبر من الإجمالي.',
  invalid_due_date: 'تاريخ الاستحقاق غير صحيح أو في الماضي.',
  invalid_email: 'البريد الإلكتروني غير صحيح.',
  invalid_file_format: 'نوع الملف غير مدعوم.',
  invalid_file_size: 'الملف أكبر من الحجم المسموح.',
  invalid_first_due_date: 'اختر تاريخ أول قسط صحيحًا.',
  invalid_frequency: 'الدورية غير معروفة.',
  invalid_guarantor_name: 'اسم الضامن غير صحيح.',
  invalid_installment_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر لكل قسط.',
  invalid_installment_count: 'أدخل عدد أقساط صحيحًا (1 أو أكثر).',
  invalid_installment_date: 'أدخل تاريخًا صحيحًا — التواريخ لازم تكون تصاعدية بدون تكرار.',
  invalid_invoice_discount: 'خصم الفاتورة غير صحيح.',
  invalid_invoice_item_numbers: 'أرقام البنود غير صحيحة.',
  invalid_invoice_item_target: 'بند الفاتورة غير صحيح.',
  invalid_invoice_items: 'بنود الفاتورة غير صحيحة — راجع المركبات والأسعار.',
  invalid_invoice_numbers: 'أرقام الفاتورة غير صحيحة.',
  invalid_logo_url: 'رابط الشعار غير صحيح.',
  invalid_mobile: 'رقم الموبايل غير صحيح.',
  invalid_movement_quantity: 'الكمية يجب أن تكون أكبر من صفر وبإشارة مناسبة.',
  invalid_movement_sign: 'إشارة الكمية لا تناسب نوع الحركة.',
  invalid_movement_target: 'اختر منتجًا أو مركبة للحركة.',
  invalid_movement_type: 'نوع الحركة غير معروف.',
  invalid_national_id: 'الرقم القومي غير صحيح.',
  invalid_note: 'الملاحظة غير صحيحة.',
  invalid_note_type: 'نوع الملاحظة غير صحيح.',
  invalid_owner_type: 'نوع المالك غير صحيح.',
  invalid_payment_amount: 'أدخل مبلغًا صحيحًا أكبر من صفر.',
  invalid_payment_method: 'طريقة الدفع غير مدعومة.',
  invalid_phone: 'رقم الهاتف غير صحيح.',
  invalid_primary_role: 'الدور الأساسي غير صحيح.',
  invalid_product_name: 'اسم المنتج غير صحيح.',
  invalid_product_numbers: 'أرقام المنتج غير صحيحة.',
  invalid_public_id: 'المعرّف العام غير صحيح.',
  invalid_reference_name: 'اسم المرجع غير صحيح.',
  invalid_role: 'الدور غير صحيح.',
  invalid_sale_discount: 'خصم البيع غير صحيح.',
  invalid_sale_item_numbers: 'أرقام بنود البيع غير صحيحة.',
  invalid_sale_item_target: 'بند البيع غير صحيح.',
  invalid_sale_items: 'بنود الفاتورة غير صحيحة — راجع المركبات والأسعار.',
  invalid_sale_numbers: 'الأرقام في فاتورة البيع غير صحيحة.',
  invalid_sale_type: 'نوع البيع غير صحيح.',
  invalid_serial_number: 'رقم الشاسيه ورقم الموتور مطلوبان (3 خانات على الأقل).',
  invalid_status: 'حالة السجل غير معروفة.',
  invalid_supplier_name: 'اسم المورد غير صحيح.',
  invalid_tax_number: 'الرقم الضريبي غير صحيح.',
  invalid_timezone: 'المنطقة الزمنية غير صحيحة.',
  invalid_title: 'العنوان غير صحيح.',
  invalid_transfer_branch: 'فرع التحويل غير صحيح.',
  invalid_transfer_item_numbers: 'أرقام بنود التحويل غير صحيحة.',
  invalid_transfer_item_target: 'بند التحويل غير صحيح.',
  invalid_transfer_items: 'بنود التحويل غير صحيحة.',
  invalid_transition: 'هذه الحالة لا تسمح بالانتقال المطلوب.',
  invalid_valuation_method: 'طريقة التقييم غير معروفة.',
  invalid_vehicle_numbers: 'قيم الأسعار والتكاليف يجب ألا تكون سالبة.',
  invalid_vehicle_type: 'نوع المركبة غير معروف.',
  invitation_already_accepted: 'الدعوة مقبولة بالفعل.',
  invitation_and_user_required: 'الدعوة وبيانات الموظف مطلوبان.',
  invitation_cancelled: 'الدعوة ملغاة.',
  invitation_exists: 'في دعوة قائمة بالفعل لهذا الموظف.',
  invitation_in_use: 'الدعوة مستخدمة بالفعل.',
  invitation_not_found: 'الدعوة غير موجودة.',
  invitation_not_processing: 'الدعوة مش في مرحلة المعالجة.',
  invitation_required: 'الدعوة مطلوبة لإتمام العملية.',
  invoice_already_cancelled: 'الفاتورة ملغاة — لا يمكن إتمام العملية.',
  invoice_locked: 'الفاتورة مقفولة — لا يمكن تعديلها.',
  invoice_missing: 'فاتورة البيع غير موجودة.',
  invoice_not_draft: 'الفاتورة ليست في حالة مسودة — لا يمكن تنفيذ العملية.',
  journal_account_missing: 'حسابات الدفتر غير مظبوطة على السيرفر — ابلغ الإدارة.',
  last_owner: 'لازم يتفضل مدير واحد على الأقل.',
  launch_branch_active_required: 'هذا الفرع لازم يفضل مفعّل.',
  launch_branch_code_immutable: 'كود الفرع غير قابل للتغيير.',
  launch_branch_locked: 'الفرع مقفول — لا يمكن تعديله.',
  legacy_installment_invalid: 'تعذر تعليم القسط كدفعة قديمة — لازم يكون القسط غير مدفوع.',
  manual_items_date_order: 'تواريخ الأقساط لازم تكون تصاعدية بدون تواريخ متكررة.',
  manual_items_required: 'أدخل صفوف الأقساط المخصصة (تاريخ + مبلغ لكل قسط).',
  no_selection: 'اختر عنصرًا واحدًا على الأقل.',
  not_authenticated: 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.',
  note_missing: 'الملاحظة غير موجودة.',
  overpayment: 'المبلغ أكبر من المتبقي على القسط.',
  owner_required: 'لازم يوجد مالك للنظام.',
  payment_source_missing: 'لا يوجد خزنة أو حساب بنكي نشط لهذا الفرع.',
  permission_denied: 'لا تملك الصلاحية لتنفيذ هذه العملية.',
  product_brand_missing: 'الماركة غير موجودة.',
  product_missing: 'المنتج غير موجود.',
  public_signup_disabled: 'التسجيل العام غير مفعّل.',
  rate_limited: 'عدد المحاولات كثير — حاول بعد قليل.',
  roles_required: 'اختر دورًا واحدًا على الأقل.',
  sales_invoice_missing: 'تعذر إنشاء فاتورة البيع.',
  schedule_missing: 'جدول الأقساط غير موجود.',
  schedule_not_draft: 'جدول الأقساط ليس في حالة مسودة.',
  sequence_missing: 'ترقيم المستندات غير مظبوط — ابلغ الإدارة.',
  service_role_required: 'العملية تحتاج صلاحيات الإدارة — ابلغ الإدارة.',
  settings_branch_code_immutable: 'كود الفرع في الإعدادات غير قابل للتغيير.',
  settings_id_immutable: 'معرّف الإعدادات غير قابل للتغيير.',
  settings_missing: 'إعدادات النظام غير موجودة — أكمل إعدادات التشغيل.',
  staff_missing: 'الموظف غير موجود.',
  staff_profile_required: 'بيانات الموظف مطلوبة.',
  supplier_inactive: 'المورد غير نشط.',
  supplier_missing: 'المورد غير موجود أو خارج نطاق فرعك.',
  transfer_missing: 'التحويل غير موجود.',
  transfer_not_draft: 'التحويل ليس في حالة مسودة.',
  transfer_not_in_transit: 'التحويل مش في الطريق.',
  unknown_code_entity: 'نوع غير معروف — ابلغ الإدارة.',
  user_not_found: 'المستخدم غير موجود.',
  user_out_of_scope: 'المستخدم مش ضمن نطاق صلاحياتك.',
  user_required: 'المستخدم مطلوب لإتمام العملية.',
  vehicle_branch_mismatch: 'المركبة ليست في هذا الفرع.',
  vehicle_locked: 'المركبة مقفولة — لا يمكن تعديلها في حالتها الحالية.',
  vehicle_missing: 'المركبة غير موجودة أو غير متاحة.',
  vehicle_unavailable: 'المركبة مش متاحة للبيع (مباعة أو مؤرشفة) — اختار مركبة تانية.',
}

/**
 * Maps common raw technical error text (PostgREST / Postgres / network) to
 * Arabic with zero technical wording. Returns null when nothing matches.
 */
export function mapTechnicalMessage(raw: string): string | null {
  const lower = raw.toLowerCase()

  if (
    lower.includes('pgrst202') ||
    lower.includes('pgrst203') ||
    lower.includes('could not find the function') ||
    lower.includes('could not choose the best candidate function') ||
    lower.includes('schema cache')
  ) {
    return 'النظام مش محدّث بالكامل — حدّث الصفحة وحاول مرة أخرى، ولو المشكلة استمرت بلغ الإدارة.'
  }

  if (
    lower.includes('permission denied') ||
    lower.includes('insufficient_privilege') ||
    lower.includes('row-level security') ||
    lower.includes('42501')
  ) {
    return 'لا تملك الصلاحية لتنفيذ هذه العملية.'
  }

  if (lower.includes('duplicate key') || lower.includes('23505')) {
    return 'في سجل بنفس البيانات موجود بالفعل.'
  }

  if (lower.includes('foreign key constraint') || lower.includes('23503')) {
    return 'هذا السجل مرتبط ببيانات أخرى — لا يمكن تنفيذ العملية قبل حذف المرتبط أو إلغاءه.'
  }

  if (lower.includes('check constraint') || lower.includes('23514')) {
    return 'القيمة المدخلة غير صحيحة أو خارج الحد المسموح.'
  }

  if (lower.includes('null value') || lower.includes('not-null') || lower.includes('23502')) {
    return 'فيه بيانات مطلوبة ناقصة — راجع الحقول المطلوبة.'
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('network request failed') ||
    lower.includes('timeout') ||
    lower.includes('timed out')
  ) {
    return 'مشكلة اتصال بالإنترنت — تحقق من الاتصال وحاول مرة أخرى.'
  }

  if (lower.includes('jwt') || lower.includes('session') || lower.includes('28000')) {
    return 'انتهت الجلسة. أعد تسجيل الدخول ثم حاول مرة أخرى.'
  }

  if (lower.startsWith('pgrst') || lower.includes('postgREST'.toLowerCase())) {
    return 'تعذر تنفيذ العملية على السيرفر — حدّث الصفحة وحاول مرة أخرى.'
  }

  return null
}
