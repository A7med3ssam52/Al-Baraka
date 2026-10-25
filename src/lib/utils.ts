import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currency = 'EGP') {
  return new Intl.NumberFormat('ar-EG-u-nu-latn', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value))
}

export function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value))
}
