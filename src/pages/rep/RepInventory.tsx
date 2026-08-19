import { useMemo, useRef, useState } from 'react'
import { useStore } from '../../lib/store'
import {
  Boxes,
  Plus,
  ImagePlus,
  Camera,
  Maximize2,
  X,
  Loader2,
  PackagePlus,
  Pencil,
} from 'lucide-react'
import { Money, Num, Sheet, EmptyState, useToast } from '../../components/ui'
import type { TruckInventoryItem } from '../../lib/types'
import { inventoryValue } from '../../lib/selectors'

export default function RepInventory() {
  const { user, data, addInventoryRow, updateInventory, uploadProductImage } = useStore()
  const { show } = useToast()

  const myStock = useMemo(
    () => data.inventory.filter((i) => i.rep_id === user?.id),
    [data.inventory, user?.id],
  )
  const totalValue = inventoryValue(myStock)

  const [editing, setEditing] = useState<TruckInventoryItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ product_name: '', quantity_loaded: '', unit_price: '', imageUrl: '' })
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [fullscreen, setFullscreen] = useState<string | null>(null)

  function openAdd() {
    setEditing(null)
    setForm({ product_name: '', quantity_loaded: '', unit_price: '', imageUrl: '' })
    setPreview(null)
    setAdding(true)
  }

  function openEdit(item: TruckInventoryItem) {
    setEditing(item)
    setForm({
      product_name: item.product_name,
      quantity_loaded: String(item.quantity_loaded),
      unit_price: String(item.unit_price),
      imageUrl: item.product_image_url ?? '',
    })
    setPreview(item.product_image_url ?? null)
    setAdding(true)
  }

  async function handleImage(file: File | undefined | null) {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadProductImage(file)
      setForm((f) => ({ ...f, imageUrl: url }))
      setPreview(url)
      show('success', 'تم رفع صورة المنتج')
    } catch (e) {
      console.error(e)
      const raw = (e as Error)?.message ?? ''
      show('error', raw.includes('row-level security') ? 'تعذر رفع الصورة — تأكد من تفعيل التخزين وإعادة تشغيل مِلف الترحيل في Supabase' : 'تعذر رفع الصورة')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    const name = form.product_name.trim()
    const qty = Math.max(0, Number(form.quantity_loaded) || 0)
    const price = Math.max(0, Number(form.unit_price) || 0)
    if (!name || qty <= 0) {
      show('error', 'اسم المنتج والكمية مطلوبان')
      return
    }
    setBusy(true)
    try {
      if (editing) {
        await updateInventory(editing.id, {
          product_name: name,
          quantity_loaded: qty,
          quantity_remaining: qty,
          unit_price: price,
          product_image_url: form.imageUrl || null,
        })
        show('success', 'تم تحديث المنتج')
      } else {
        await addInventoryRow({
          store_id: user?.store_id ?? '',
          rep_id: user?.id ?? '',
          product_name: name,
          product_image_url: form.imageUrl || null,
          quantity_loaded: qty,
          quantity_remaining: qty,
          unit_price: price,
        })
        show('success', 'تمت إضافة المنتج إلى الشاحنة')
      }
      setAdding(false)
    } catch (e) {
      console.error(e)
      show('error', 'تعذر الحفظ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Boxes className="size-6" />
          </span>
          <div>
            <div className="text-xs font-bold text-muted-foreground">قيمة مخزون الشاحنة</div>
            <Money value={totalValue} className="text-xl font-extrabold" />
            <div className="text-xs text-muted-foreground">
              <Num value={myStock.length} /> منتج · <Num value={myStock.reduce((s, i) => s + i.quantity_remaining, 0)} /> قطعة
            </div>
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary btn-md">
          <Plus className="size-5" /> إضافة
        </button>
      </div>

      {myStock.length === 0 ? (
        <EmptyState
          icon={<Boxes className="size-7" />}
          title="الشاحنة فارغة"
          desc="أضف منتجاتك الأولى لتبدأ ببيعها وخصمها تلقائياً عند إصدار الفواتير."
          action={
            <button onClick={openAdd} className="btn-primary btn-md">
              <PackagePlus className="size-5" /> إضافة أول منتج
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {myStock.map((item) => (
            <div key={item.id} className="card p-3.5 flex items-center gap-3">
              {item.product_image_url ? (
                <button
                  onClick={() => setFullscreen(item.product_image_url!)}
                  className="size-14 shrink-0 rounded-xl overflow-hidden border border-border relative group"
                  aria-label={`عرض صورة ${item.product_name}`}
                >
                  <img
                    src={item.product_image_url}
                    alt={item.product_name}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="size-5" />
                  </span>
                </button>
              ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Boxes className="size-7" />
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-extrabold truncate">{item.product_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <Money value={item.unit_price} /> / قطعة
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs font-bold">
                  <span className="text-muted-foreground">تحميل: <Num value={item.quantity_loaded} /></span>
                  <span className={item.quantity_remaining <= 0 ? 'text-destructive' : 'text-accent'}>
                    متبقي: <Num value={item.quantity_remaining} />
                  </span>
                </div>
              </div>
              <button onClick={() => openEdit(item)} className="btn-ghost btn-sm p-2" aria-label="تعديل المنتج">
                <Pencil className="size-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit sheet */}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={editing ? 'تعديل المنتج' : 'إضافة منتج للشاحنة'}
        footer={
          <>
            <button onClick={() => setAdding(false)} className="btn-outline btn-lg flex-1">إلغاء</button>
            <button onClick={handleSubmit} disabled={busy} className="btn-primary btn-lg flex-1">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <PackagePlus className="size-5" />}
              حفظ
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Image picker */}
          <div>
            <label className="label">صورة المنتج</label>
            <button
              type="button"
              onClick={() => preview && setFullscreen(preview)}
              className="relative w-full aspect-video rounded-xl border-2 border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden"
            >
              {preview ? (
                <img src={preview} alt="معاينة المنتج" className="w-full h-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  {uploading ? (
                    <Loader2 className="size-7 animate-spin" />
                  ) : (
                    <ImagePlus className="size-7" />
                  )}
                  <span className="text-sm font-bold">{uploading ? 'جارٍ الرفع...' : 'أضف صورة للمنتج'}</span>
                </span>
              )}
              {preview && (
                <span className="absolute top-2 end-2 grid size-8 place-items-center rounded-lg bg-black/60 text-white">
                  <X className="size-5" />
                </span>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-outline btn-md"
              >
                <ImagePlus className="size-5" /> من المعرض
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={uploading}
                className="btn-outline btn-md"
              >
                <Camera className="size-5" /> التقاط صورة
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          <div>
            <label htmlFor="pname" className="label">اسم المنتج *</label>
            <input
              id="pname"
              className="input"
              placeholder="مثال: علبة حليب 1 لتر"
              value={form.product_name}
              onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pqty" className="label">الكمية المحملة *</label>
              <input
                id="pqty"
                type="number"
                inputMode="numeric"
                min={0}
                className="input tnum"
                dir="ltr"
                placeholder="0"
                value={form.quantity_loaded}
                onChange={(e) => setForm((f) => ({ ...f, quantity_loaded: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pprice" className="label">سعر القطعة (أ.م)</label>
              <input
                id="pprice"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="input tnum"
                dir="ltr"
                placeholder="0.00"
                value={form.unit_price}
                onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            عند إصدار فاتورة يُخصم العدد المباع تلقائياً من الكمية المتبقية.
          </p>
        </div>
      </Sheet>

      {/* Fullscreen image preview */}
      {fullscreen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-4" dir="rtl">
          <button
            onClick={() => setFullscreen(null)}
            className="absolute top-4 end-4 grid size-11 place-items-center rounded-full bg-white/10 text-white"
            aria-label="إغلاق المعاينة"
          >
            <X className="size-6" />
          </button>
          <img
            src={fullscreen}
            alt="معاينة المنتج"
            className="max-h-[92dvh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={() => setFullscreen(null)}
          />
        </div>
      )}
    </div>
  )
}
