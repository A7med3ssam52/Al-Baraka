export const APP_INFO = {
  name: 'معرض البركة',
  nameEn: 'Al Baraka',
  tagline: 'بيع وشراء التكاتك والموتوسيكلات والمركبات',
  branch: {
    name: 'فرع صان الحجر',
    code: 'SNH-01',
    address: 'محافظة الشرقية — مركز صان الحجر — بجوار مركز الشرطة',
  },
  contacts: [
    {
      name: 'أستاذ أحمد عبد الهادي',
      phones: ['01000172840', '01010559737'],
    },
    {
      name: 'أستاذ حمدي أحمد',
      phones: ['01026532231', '01029908833'],
    },
  ],
  currency: 'EGP',
  timezone: 'Africa/Cairo',
} as const

export const STAGE = {
  current: 'M0.1',
  currentTitle: 'إنشاء المشروع والهيكل الأساسي',
  next: 'M0.2',
  nextTitle: 'الهوية البصرية وتخطيط التطبيق',
} as const
