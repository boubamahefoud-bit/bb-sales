export const CURRENCY = 'أ.م'

const moneyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function fmtMoney(n: number): string {
  return `${moneyFmt.format(Number.isFinite(n) ? n : 0)} ${CURRENCY}`
}

export function fmtNum(n: number): string {
  return numFmt.format(Number.isFinite(n) ? n : 0)
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10)
}
