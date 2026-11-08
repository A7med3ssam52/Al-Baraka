/**
 * Smart customer search helpers — mirror of the `search_customers` RPC.
 * Used as a fallback if the RPC is not deployed yet, and for highlighting.
 * No technical strings are shown to the user.
 */

export function toLatinDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

export function normalizeArabic(input: string): string {
  return toLatinDigits(input)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ـً-ٰٟ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function digitsOnly(input: string): string {
  return toLatinDigits(input).replace(/[^0-9]/g, '')
}

export function normalizeMobile(input: string): string | null {
  let d = digitsOnly(input)
  if (d.length < 4) return null
  if (d.startsWith('0020')) d = d.slice(4)
  else if (d.startsWith('20') && d.length > 10) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d
}

export function searchTokens(search: string): string[] {
  const norm = normalizeArabic(search)
  return norm ? norm.split(' ').filter(Boolean) : []
}

export interface SearchableCustomer {
  code: string
  full_name: string
  national_id?: string
  mobile?: string
  phone2?: string | null
}

/** Client-side smart filter (fallback + dialog dropdowns). */
export function filterCustomersSmart<T extends SearchableCustomer>(
  rows: T[],
  search: string,
): T[] {
  const tokens = searchTokens(search)
  if (!tokens.length) return [...rows]
  const scored = rows
    .map((row) => {
      const normName = normalizeArabic(row.full_name ?? '')
      const nid = digitsOnly(row.national_id ?? '')
      const mobileNat = row.mobile ? (normalizeMobile(row.mobile) ?? digitsOnly(row.mobile)) : ''
      const mobileFull = row.mobile ? digitsOnly(row.mobile) : ''
      const phone2Nat = row.phone2 ? (normalizeMobile(row.phone2) ?? digitsOnly(row.phone2)) : ''
      const phone2Full = row.phone2 ? digitsOnly(row.phone2) : ''
      const codeDigits = digitsOnly(row.code)
      const codeLower = row.code.toLowerCase()
      const qDigits = digitsOnly(search)
      const qMobile = normalizeMobile(search) ?? ''
      const qNorm = normalizeArabic(search)
      const matches = tokens.every((tok) => {
        const tokDigits = digitsOnly(tok)
        return (
          normName.includes(tok) ||
          codeLower.includes(tok) ||
          (tokDigits !== '' &&
            (nid.includes(tokDigits) ||
              (mobileNat && mobileNat.includes(tokDigits)) ||
              (mobileFull && mobileFull.includes(tokDigits)) ||
              (phone2Nat && phone2Nat.includes(tokDigits)) ||
              (phone2Full && phone2Full.includes(tokDigits)) ||
              codeDigits.includes(tokDigits)))
        )
      })
      let rank = 4
      if (qDigits && nid === qDigits) rank = 0
      else if (qMobile && mobileNat === qMobile) rank = 1
      else if (codeLower === qNorm || (qDigits && codeDigits === qDigits)) rank = 2
      else if (normName.startsWith(qNorm) && qNorm) rank = 3
      return { row, matches, rank }
    })
    .filter((item) => item.matches)
    .sort((a, b) => a.rank - b.rank || a.row.code.localeCompare(b.row.code))
  return scored.map((item) => item.row)
}

/** Split text into highlighted / plain parts for a simple <mark>. */
export function splitHighlight(text: string, search: string): { text: string; hit: boolean }[] {
  const term = search.trim()
  if (!term) return [{ text, hit: false }]
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return [{ text, hit: false }]
  const parts: { text: string; hit: boolean }[] = []
  if (idx > 0) parts.push({ text: text.slice(0, idx), hit: false })
  parts.push({ text: text.slice(idx, idx + term.length), hit: true })
  if (idx + term.length < text.length) {
    parts.push({ text: text.slice(idx + term.length), hit: false })
  }
  return parts
}
