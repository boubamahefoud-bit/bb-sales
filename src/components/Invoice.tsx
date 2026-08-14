import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { Download, Share2, Truck, Loader2 } from 'lucide-react'
import { useToast } from './ui'
import { fmtDateTime } from '../lib/format'
import type { SalesTransaction, TransactionItem, UserProfile } from '../lib/types'

export default function Invoice({
  transaction,
  customer,
  rep,
  store,
  items = [],
}: {
  transaction: SalesTransaction
  customer?: Pick<{ id: string; name: string; phone?: string | null; address?: string | null }, 'id' | 'name' | 'phone' | 'address'>
  rep?: Pick<UserProfile, 'full_name' | 'truck_id'>
  store?: { id: string; name: string }
  items?: TransactionItem[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { show } = useToast()
  const [busy, setBusy] = useState(false)

  const status = transaction.payment_status
  const statusMeta =
    status === 'paid'
      ? { label: 'مدفوع', en: 'PAID', cls: 'bg-emerald-600 text-white' }
      : status === 'debt'
        ? { label: 'دين', en: 'DEBT', cls: 'bg-red-600 text-white' }
        : { label: 'جزئي', en: 'PARTIAL', cls: 'bg-amber-500 text-white' }

  async function downloadImage() {
    if (!ref.current) return
    setBusy(true)
    try {
      show('info', 'جارٍ إنشاء صورة الفاتورة...')
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `BB-Sales-invoice-${transaction.id.slice(0, 8)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      show('success', 'تم تنزيل الفاتورة كصورة')
    } catch (e) {
      console.error(e)
      show('error', 'تعذر إنشاء الصورة')
    } finally {
      setBusy(false)
    }
  }

  function shareWhatsApp() {
    const lines = [
      '*BB Sales | بي بي سيلز — فاتورة*',
      `المتجر: ${store?.name ?? '—'}`,
      `المندوب: ${rep?.full_name ?? '—'}${rep?.truck_id ? ` | الشاحنة: ${rep.truck_id}` : ''}`,
      `العميل: ${customer?.name ?? '—'}`,
      `التاريخ: ${fmtDateTime(transaction.created_at)}`,
      '',
      '*الأصناف:*',
      ...items.map(
        (i) => `• ${i.product_name}: ${i.quantity} × ${i.unit_price.toFixed(2)} = ${i.subtotal.toFixed(2)} ر.س`,
      ),
      '',
      `*الإجمالي:* ${transaction.total_amount.toFixed(2)} ر.س`,
      `*المدفوع:* ${transaction.paid_amount.toFixed(2)} ر.س`,
      `*الدين المتبقي:* ${transaction.debt_amount.toFixed(2)} ر.س`,
      `*الحالة:* ${statusMeta.label} (${statusMeta.en})`,
    ]
    const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-4">
      {/* Receipt */}
      <div className="rounded-2xl border-2 border-dashed border-border bg-white text-slate-900 p-5" dir="rtl">
        <div ref={ref} className="space-y-4 bg-white">
          <div className="flex items-start justify-between gap-3 border-b-2 border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-blue-600 text-white">
                  <Truck className="size-5" />
                </span>
                <div>
                  <div className="text-lg font-extrabold leading-none">BB Sales</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">بي بي سيلز</div>
                </div>
              </div>
              <div className="mt-2 text-sm font-bold">المتجر: {store?.name ?? '—'}</div>
            </div>
            <span className={`px-3 py-1.5 rounded-lg text-sm font-extrabold ${statusMeta.cls}`}>
              {statusMeta.label} · {statusMeta.en}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div>
              <span className="text-slate-500">المندوب:</span>{' '}
              <span className="font-bold">{rep?.full_name ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">الشاحنة:</span>{' '}
              <span className="font-bold">{rep?.truck_id ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">العميل:</span>{' '}
              <span className="font-bold">{customer?.name ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">التاريخ:</span>{' '}
              <span className="font-bold">{fmtDateTime(transaction.created_at)}</span>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-y-2 border-slate-200">
                <th className="text-start py-2 font-extrabold">الصنف</th>
                <th className="text-center py-2 font-extrabold">الكمية</th>
                <th className="text-center py-2 font-extrabold">السعر</th>
                <th className="text-end py-2 font-extrabold">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-slate-400">لا توجد أصناف</td>
                </tr>
              )}
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100">
                  <td className="py-2 font-bold">{i.product_name}</td>
                  <td className="py-2 text-center tnum" dir="ltr">{i.quantity}</td>
                  <td className="py-2 text-center tnum" dir="ltr">{i.unit_price.toFixed(2)}</td>
                  <td className="py-2 text-end tnum font-bold" dir="ltr">{i.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 text-sm border-t-2 border-slate-200 pt-3">
            <div className="flex justify-between">
              <span className="text-slate-500">الإجمالي الكلي</span>
              <span className="font-extrabold tnum" dir="ltr">{transaction.total_amount.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">المدفوع نقداً</span>
              <span className="font-bold tnum text-emerald-700" dir="ltr">{transaction.paid_amount.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الدين المتبقي</span>
              <span className="font-bold tnum text-red-700" dir="ltr">{transaction.debt_amount.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 pt-2 border-t border-slate-100">
            فاتورة إلكترونية صادرة من نظام BB Sales · بي بي سيلز
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={downloadImage} disabled={busy} className="btn-primary btn-lg w-full">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
          تنزيل كصورة
        </button>
        <button onClick={shareWhatsApp} className="btn-accent btn-lg w-full">
          <Share2 className="size-5" />
          مشاركة واتساب
        </button>
      </div>
    </div>
  )
}
