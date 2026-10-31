import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from 'react';
import axios from 'axios';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useHorizontalWheelScroll } from '../hooks/useHorizontalWheelScroll';

const CATEGORIES = [
  'Café',
  'Jugos naturales',
  'Bebidas',
  'Fritos',
  'Mecato',
  'Dulces',
  'Lácteos',
  'Papelería',
  'Aseo',
  'Medicamentos',
] as const;
type Category = (typeof CATEGORIES)[number];
export type Filter = 'Todos' | Category;

export const FILTERS: { id: Filter; label: string }[] = [
  { id: 'Todos', label: 'Todos' },
  ...CATEGORIES.map((category) => ({ id: category, label: category })),
];

interface Product {
  id: string;
  nombre: string;
  categoria: Category;
  linea: string;
  fechaVencimiento: string;
  costo: number;
  precioVenta: number;
  stock: number;
  stockMaximo: number;
  stockMinimo: number;
  imagen: string;
  updatedAt: string;
}

interface ProductForm {
  nombre: string;
  categoria: Category;
  linea: string;
  fechaVencimiento: string;
  costo: string;
  precioVenta: string;
  stock: string;
  stockMaximo: string;
  stockMinimo: string;
  imagen: string;
}

const LAST_CATEGORY_KEY = 'puntoCafe.lastProductCategory';

function readLastProductCategory(): Category {
  try {
    const saved = localStorage.getItem(LAST_CATEGORY_KEY);
    if (saved && (CATEGORIES as readonly string[]).includes(saved)) {
      return saved as Category;
    }
  } catch {
    /* ignore */
  }
  return 'Café';
}

function rememberProductCategory(categoria: Category) {
  try {
    localStorage.setItem(LAST_CATEGORY_KEY, categoria);
  } catch {
    /* ignore */
  }
}

const emptyForm = (): ProductForm => ({
  nombre: '',
  categoria: readLastProductCategory(),
  linea: '',
  fechaVencimiento: '',
  costo: '',
  precioVenta: '',
  stock: '',
  stockMaximo: '40',
  stockMinimo: '8',
  imagen: '',
});

/** Al cerrar el modal o salir de Productos, el borrador se limpia si no vuelves en este tiempo. */
const PRODUCT_DRAFT_AWAY_MS = 60 * 1000;

const productNewDraft: {
  form: ProductForm;
  porcentaje: number;
  leftAt: number;
  open: boolean;
} = {
  form: emptyForm(),
  porcentaje: 40,
  leftAt: 0,
  open: false,
};

function clearProductNewDraft() {
  productNewDraft.form = emptyForm();
  productNewDraft.porcentaje = 40;
  productNewDraft.leftAt = 0;
  productNewDraft.open = false;
}

function productDraftExpired() {
  return Boolean(productNewDraft.leftAt && Date.now() - productNewDraft.leftAt >= PRODUCT_DRAFT_AWAY_MS);
}

/** Arranca el temporizador al salir del modal o de la vista. */
function markProductDraftAway() {
  productNewDraft.open = false;
  productNewDraft.leftAt = productDraftHasContent() ? Date.now() : 0;
}

function productDraftHasContent(form: ProductForm = productNewDraft.form) {
  return Boolean(
    form.nombre.trim() ||
      form.linea.trim() ||
      form.costo ||
      form.precioVenta ||
      form.fechaVencimiento ||
      form.imagen ||
      (form.stock && form.stock !== '0'),
  );
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('Todos');
  const [editor, setEditor] = useState<Product | null | 'new'>(() => {
    if (productDraftExpired()) {
      clearProductNewDraft();
      return null;
    }
    productNewDraft.leftAt = 0;
    return productNewDraft.open ? 'new' : null;
  });
  const [buying, setBuying] = useState<Product | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const categoryRowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const previousQuery = useRef('');
  const [locatedId, setLocatedId] = useState<string | null>(null);

  useHorizontalWheelScroll(categoryRowRef, gridRef);

  async function load() {
    const response = await api.get<Product[]>('/productos');
    setProducts(response.data);
  }

  async function confirmRemoveProduct() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/productos/${pendingDelete.id}`);
      setError('');
      setPendingDelete(null);
      await load();
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    load()
      .catch(() => setError('No se pudieron cargar los productos'))
      .finally(() => setLoading(false));
  }, []);

  // Si el modal está abierto al volver, pausa el temporizador.
  useEffect(() => {
    if (editor === 'new') productNewDraft.leftAt = 0;
  }, [editor]);

  // Al salir de la vista Productos, arranca (o mantiene) el temporizador del borrador.
  useEffect(() => {
    return () => {
      if (productNewDraft.open) {
        markProductDraftAway();
        return;
      }
      if (productDraftHasContent() && !productNewDraft.leftAt) {
        productNewDraft.leftAt = Date.now();
      }
      if (!productDraftHasContent()) {
        productNewDraft.leftAt = 0;
      }
    };
  }, []);

  const visible = useMemo(() => {
    return products
      .filter((product) => filter === 'Todos' || product.categoria === filter)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  }, [products, filter]);

  const matchId = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return null;
    return visible.find((product) => product.nombre.toLowerCase().includes(term))?.id ?? null;
  }, [visible, query]);

  useEffect(() => {
    const term = query.trim();
    const grew = term.length > previousQuery.current.length;
    previousQuery.current = term;
    if (!term) {
      setLocatedId(null);
      return;
    }
    if (!grew) return;
    setLocatedId(matchId);

    const grid = gridRef.current;
    if (!grid || !matchId) return;
    const card = grid.querySelector<HTMLElement>(`[data-id="${matchId}"]`);
    if (!card) return;
    const left = card.offsetLeft - (grid.clientWidth - card.offsetWidth) / 2;
    grid.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [query, matchId]);

  const capital = products.reduce((total, product) => total + product.costo * product.stock, 0);
  const lowStock = products.filter((product) => product.stock <= product.stockMinimo).length;
  const expired = products.filter(
    (product) => product.fechaVencimiento && expiryTone(product.fechaVencimiento) === 'is-expired',
  ).length;

  return (
    <section className="products">
      <div className="category-head">
        <h1>Categorías</h1>
        <div className="products-tools">
          <label className="search-field">
            <input
              className="search"
              type="search"
              placeholder="Buscar producto..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Buscar producto"
            />
            <SearchIcon />
          </label>
          <button
            className="button button-new"
            type="button"
            onClick={() => {
              if (productDraftExpired()) clearProductNewDraft();
              productNewDraft.open = true;
              productNewDraft.leftAt = 0;
              setEditor('new');
            }}
          >
            Nuevo producto
          </button>
        </div>
      </div>

      <div className="category-row" ref={categoryRowRef} role="tablist" aria-label="Categorías">
        {FILTERS.map((category) => (
          <button
            key={category.id}
            className={filter === category.id ? 'category-card is-active' : 'category-card'}
            type="button"
            role="tab"
            aria-selected={filter === category.id}
            onClick={() => setFilter(category.id)}
          >
            <CategoryIcon name={category.id} />
            <span>{category.label}</span>
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? <p className="muted-line">Cargando productos…</p> : null}

      {!loading && visible.length === 0 ? (
        <article className="welcome-card">
          <p className="welcome-copy">
            {products.length === 0
              ? 'Todavía no hay productos. Crea el primero con Nuevo producto.'
              : 'Ningún producto coincide con este filtro.'}
          </p>
        </article>
      ) : null}

      <div className="product-grid" ref={gridRef}>
        {visible.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            found={product.id === locatedId}
            onEdit={() => setEditor(product)}
            onDelete={() => setPendingDelete(product)}
            onBuy={() => setBuying(product)}
          />
        ))}
      </div>

      <div className="summary-row">
        <article className="summary-card">
          <p>Total</p>
          <strong>{products.length}</strong>
        </article>
        <article className="summary-card">
          <p>Capital</p>
          <strong>{pesos(capital)}</strong>
        </article>
        <article className="summary-card">
          <p>Stock bajo</p>
          <strong className={lowStock > 0 ? 'is-alert' : ''}>{lowStock}</strong>
        </article>
        <article className="summary-card">
          <p>Productos vencidos</p>
          <strong className={expired > 0 ? 'is-alert' : ''}>{expired}</strong>
        </article>
      </div>

      {editor ? (
        <ProductDialog
          product={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            setError('');
            await load();
          }}
        />
      ) : null}

      {buying ? (
        <BuyDialog
          product={buying}
          onClose={() => setBuying(null)}
          onSaved={async () => {
            setBuying(null);
            setError('');
            await load();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Eliminar producto"
          message={`¿Eliminar ${pendingDelete.nombre}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          busy={deleting}
          onCancel={() => {
            if (!deleting) setPendingDelete(null);
          }}
          onConfirm={() => void confirmRemoveProduct()}
        />
      ) : null}
    </section>
  );
}

function ProductCard({
  product,
  found,
  onEdit,
  onDelete,
  onBuy,
}: {
  product: Product;
  found: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onBuy: () => void;
}) {
  const low = product.stock <= product.stockMinimo;
  const percent = product.stockMaximo > 0 ? Math.min(100, (product.stock / product.stockMaximo) * 100) : 0;

  return (
    <article className="product-card" data-id={product.id}>
      <div className="product-photo">
        {product.imagen ? (
          <img src={product.imagen} alt="" />
        ) : (
          <>
            <CupIcon />
            <span>Foto del producto</span>
          </>
        )}
      </div>
      {product.fechaVencimiento ? (
        <p className={`product-expiry ${expiryTone(product.fechaVencimiento)}`.trim()}>
          Vence {formatExpiry(product.fechaVencimiento)}
        </p>
      ) : null}
      <div className="product-body">
        <h2 className={found ? 'is-located' : undefined}>{product.nombre}</h2>
        {product.linea ? <p className="product-meta">{product.linea}</p> : null}
        <div className="money-row">
          <div>
            <span>Costo</span>
            <strong>{pesos(product.costo)}</strong>
          </div>
          <div>
            <span>Venta</span>
            <strong>{pesos(product.precioVenta)}</strong>
          </div>
          <div>
            <span>Ganancia</span>
            <strong className={product.precioVenta - product.costo < 0 ? 'is-gain is-negative' : 'is-gain'}>
              {pesos(product.precioVenta - product.costo)}
            </strong>
          </div>
        </div>
        <div className="stock-row">
          <span>{low ? 'Stock · Bajo' : 'Stock'}</span>
          <strong className={low ? 'is-alert' : ''}>
            {product.stock} / {product.stockMaximo} uds
          </strong>
        </div>
        <div className="stock-track" aria-hidden="true">
          <span className={low ? 'is-low' : ''} style={{ width: `${percent}%` }} />
        </div>
        <p className="updated-at">{formatUpdated(product.updatedAt)}</p>
        <div className="card-actions">
          <button
            className="button button-quiet icon-button"
            type="button"
            aria-label={`Eliminar ${product.nombre}`}
            onClick={onDelete}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
              <path d="M6.5 7l.8 12.2A1.8 1.8 0 0 0 9.1 21h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
              <path d="M10 11.2v6" />
              <path d="M14 11.2v6" />
            </svg>
          </button>
          <button className="button button-quiet" type="button" onClick={onEdit}>
            Editar
          </button>
          <button className="button" type="button" onClick={onBuy}>
            Reabastecer
          </button>
        </div>
      </div>
    </article>
  );
}

const GAIN_PERCENTS = [35, 40, 45, 50] as const;

function saleFromUnit(valorUnitario: number, porcentaje: number) {
  const ganancia = Math.round(valorUnitario * (porcentaje / 100));
  return valorUnitario + ganancia;
}

function formatMiles(digits: string) {
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function placeMoneyCursor(input: HTMLInputElement, digitsBefore: number) {
  const formatted = input.value;
  if (digitsBefore <= 0) {
    input.setSelectionRange(0, 0);
    return;
  }
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) {
      seen += 1;
      if (seen === digitsBefore) {
        input.setSelectionRange(index + 1, index + 1);
        return;
      }
    }
  }
  input.setSelectionRange(formatted.length, formatted.length);
}

export function MoneyField({
  label,
  value,
  onChange,
  sign = false,
  required = false,
  inputRef: externalRef,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  sign?: boolean;
  required?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? localRef;
  const digitsBefore = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const count = digitsBefore.current;
    if (!input || count === null || document.activeElement !== input) return;
    placeMoneyCursor(input, count);
    digitsBefore.current = null;
  }, [value, inputRef]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const cursor = event.target.selectionStart ?? raw.length;
    digitsBefore.current = raw.slice(0, cursor).replace(/\D/g, '').length;
    onChange(raw.replace(/\D/g, ''));
  }

  const control = (
    <div className={sign ? 'money-input has-sign' : 'money-input'}>
      {sign ? (
        <span className="money-sign" aria-hidden="true">
          $
        </span>
      ) : null}
      <input
        ref={inputRef}
        inputMode="numeric"
        placeholder="0"
        value={formatMiles(value)}
        onChange={handleChange}
        required={required}
        aria-label={label || 'Monto'}
      />
    </div>
  );

  if (!label) return control;

  return (
    <label className="field">
      <span>{label}</span>
      {control}
    </label>
  );
}

function closestPercent(costo: number, venta: number) {
  if (costo <= 0) return 40;
  const markup = ((venta - costo) / costo) * 100;
  return GAIN_PERCENTS.reduce((best, option) =>
    Math.abs(option - markup) < Math.abs(best - markup) ? option : best,
  );
}

function FieldTip({ children }: { children: string }) {
  return (
    <p className="field-tip" role="alert">
      <span className="field-tip-mark" aria-hidden="true">
        !
      </span>
      {children}
    </p>
  );
}

function ProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isNew = !product;
  const [form, setForm] = useState<ProductForm>(() => {
    if (product) {
      return {
        nombre: product.nombre,
        categoria: product.categoria,
        linea: product.linea,
        fechaVencimiento: product.fechaVencimiento ?? '',
        // En el form el costo es el total del lote; al editar se reconstruye.
        costo: String(product.stock > 0 ? product.costo * product.stock : product.costo),
        precioVenta: String(product.precioVenta),
        stock: String(product.stock),
        stockMaximo: String(product.stockMaximo),
        stockMinimo: String(product.stockMinimo),
        imagen: product.imagen,
      };
    }
    if (productDraftExpired()) {
      clearProductNewDraft();
      return emptyForm();
    }
    productNewDraft.leftAt = 0;
    return productDraftHasContent() ? { ...productNewDraft.form } : emptyForm();
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tip, setTip] = useState<{ field: string; message: string } | null>(null);
  const [porcentaje, setPorcentaje] = useState(() => {
    if (product) return closestPercent(product.costo, product.precioVenta);
    return productNewDraft.porcentaje || 40;
  });

  function clearTip(field?: string) {
    setTip((current) => {
      if (!current) return null;
      if (field && current.field !== field) return current;
      return null;
    });
  }

  function update(field: keyof ProductForm, value: string) {
    clearTip(field);
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applySale(costoText: string, percent: number, stockText: string) {
    if (costoText === '') {
      setForm((current) => ({ ...current, costo: '', stock: stockText, precioVenta: '' }));
      return;
    }
    const costo = Number(costoText);
    const cantidad = Number(stockText) || 0;
    if (!Number.isFinite(costo)) return;
    const valorUnitario = cantidad > 0 ? Math.round(costo / cantidad) : 0;
    const venta = valorUnitario > 0 ? String(saleFromUnit(valorUnitario, percent)) : '';
    setForm((current) => ({
      ...current,
      costo: costoText,
      stock: stockText,
      precioVenta: venta,
    }));
  }

  useEffect(() => {
    if (!isNew) return;
    productNewDraft.form = form;
    productNewDraft.porcentaje = porcentaje;
    productNewDraft.open = true;
    productNewDraft.leftAt = 0;
  }, [isNew, form, porcentaje]);

  const costo = Number(form.costo) || 0;
  const cantidad = Number(form.stock) || 0;
  const valorUnitario = cantidad > 0 ? Math.round(costo / cantidad) : 0;
  const ganaUnidad = Math.round(valorUnitario * (porcentaje / 100));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!form.nombre.trim()) {
      setTip({ field: 'nombre', message: 'Rellena este campo para continuar' });
      return;
    }
    if (form.costo === '') {
      setTip({ field: 'costo', message: 'Rellena este campo para continuar' });
      return;
    }
    if (form.stock === '') {
      setTip({ field: 'stock', message: 'Rellena este campo para continuar' });
      return;
    }
    if (!form.fechaVencimiento) {
      setTip({ field: 'fechaVencimiento', message: 'Rellena este campo para continuar' });
      return;
    }
    if (expiryTone(form.fechaVencimiento) === 'is-expired') {
      setTip({
        field: 'fechaVencimiento',
        message: 'La fecha ya venció; elige una fecha de hoy en adelante',
      });
      return;
    }
    if (form.precioVenta === '') {
      setTip({ field: 'precioVenta', message: 'Rellena este campo para continuar' });
      return;
    }

    setTip(null);
    setSaving(true);
    const stock = Number(form.stock);
    // Al crear, la barra inicia llena (ej. 22/22). Luego el máximo solo sube si se supera.
    const stockMaximo = product
      ? Math.max(Number(form.stockMaximo) || 0, stock, 1)
      : Math.max(stock, 1);
    const rawMin = Number(form.stockMinimo);
    const stockMinimo = Math.min(
      Number.isFinite(rawMin) && rawMin >= 0
        ? rawMin
        : Math.max(1, Math.round(stockMaximo * 0.2)),
      stockMaximo,
    );
    const payload = {
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      linea: form.linea.trim(),
      fechaVencimiento: form.fechaVencimiento,
      // Se guarda costo y venta por unidad.
      costo: valorUnitario > 0 ? valorUnitario : Number(form.costo),
      precioVenta: Number(form.precioVenta),
      stock,
      stockMaximo,
      stockMinimo,
      imagen: form.imagen.trim(),
    };

    try {
      if (product) {
        await api.patch(`/productos/${product.id}`, payload);
      } else {
        await api.post('/productos', payload);
        rememberProductCategory(form.categoria);
        clearProductNewDraft();
      }
      await onSaved();
    } catch (caught) {
      setError(readError(caught));
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isNew) markProductDraftAway();
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleCancel}>
      <form
        className="modal"
        noValidate
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>{product ? 'Editar producto' : 'Nuevo producto'}</h2>
        <div className="form-name-row">
          <label className={tip?.field === 'nombre' ? 'field has-tip' : 'field'}>
            <span>Nombre</span>
            <input
              value={form.nombre}
              placeholder="Nombre del producto"
              onChange={(event) => update('nombre', event.target.value)}
            />
            {tip?.field === 'nombre' ? <FieldTip>{tip.message}</FieldTip> : null}
          </label>
          <label className="field">
            <span>Categoría</span>
            <select
              value={form.categoria}
              onChange={(event) => update('categoria', event.target.value as Category)}
            >
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-price-row">
          <div className={tip?.field === 'costo' ? 'field-stack has-tip' : 'field-stack'}>
            <MoneyField
              label="Costo"
              value={form.costo}
              sign
              onChange={(digits) => {
                clearTip('costo');
                applySale(digits, porcentaje, form.stock);
              }}
            />
            {tip?.field === 'costo' ? <FieldTip>{tip.message}</FieldTip> : null}
          </div>
          <label className={tip?.field === 'stock' ? 'field has-tip' : 'field'}>
            <span>Cantidad</span>
            <input
              className="qty-number"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="0"
              value={form.stock}
              onChange={(event) => {
                const next = event.target.value.replace(/\D/g, '');
                clearTip('stock');
                applySale(form.costo, porcentaje, next);
              }}
            />
            {tip?.field === 'stock' ? <FieldTip>{tip.message}</FieldTip> : null}
          </label>
          <label className="field">
            <span>Ganancia</span>
            <select
              value={porcentaje}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPorcentaje(next);
                applySale(form.costo, next, form.stock);
              }}
            >
              {GAIN_PERCENTS.map((option) => (
                <option key={option} value={option}>
                  {option}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-meta-row">
          <label className="field">
            <span>Descripción</span>
            <input
              value={form.linea}
              placeholder="Descripción del producto"
              onChange={(event) => update('linea', event.target.value)}
            />
          </label>
          <label className={tip?.field === 'fechaVencimiento' ? 'field has-tip' : 'field'}>
            <span>Fecha de vencimiento</span>
            <input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={form.fechaVencimiento}
              onChange={(event) => update('fechaVencimiento', event.target.value)}
            />
            {tip?.field === 'fechaVencimiento' ? <FieldTip>{tip.message}</FieldTip> : null}
          </label>
        </div>
        <div className="form-photo-row">
          <label className="field form-photo-field">
            <span>Foto del producto</span>
            <input
              type="url"
              inputMode="url"
              placeholder="Pega aquí la URL de la imagen"
              value={form.imagen}
              onChange={(event) => update('imagen', event.target.value)}
            />
          </label>
          {form.imagen ? (
            <img
              className="form-preview"
              src={form.imagen}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
              onLoad={(event) => {
                event.currentTarget.style.display = '';
              }}
            />
          ) : null}
        </div>
        <div className="price-facts">
          <p>
            <span>Valor unitario</span>
            <strong>{pesos(valorUnitario)}</strong>
          </p>
          <p>
            <span>Ganancia</span>
            <strong className={ganaUnidad < 0 ? 'is-gain is-negative' : 'is-gain'}>{pesos(ganaUnidad)}</strong>
          </p>
        </div>
        <div className={tip?.field === 'precioVenta' ? 'field-stack has-tip' : 'field-stack'}>
          <MoneyField
            label="Valor de venta"
            value={form.precioVenta}
            sign
            onChange={(digits) => update('precioVenta', digits)}
          />
          {tip?.field === 'precioVenta' ? <FieldTip>{tip.message}</FieldTip> : null}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <div className="card-actions">
            <button className="button button-quiet" type="button" onClick={handleCancel}>
              Cancelar
            </button>
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function BuyDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [cantidad, setCantidad] = useState(10);
  const [costoGeneral, setCostoGeneral] = useState(String(Math.round(product.costo * 10)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<Array<{ productoId?: string; monto: number; nota?: string; createdAt: string; categoria: string }>>(
        '/gastos',
      )
      .then((response) => {
        if (cancelled) return;
        const last = response.data
          .filter(
            (expense) =>
              expense.categoria === 'compra-productos' && expense.productoId === product.id,
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!last) return;
        const lastQty = parsePurchaseQuantity(last.nota) ?? 10;
        setCantidad(Math.max(1, lastQty));
        setCostoGeneral(String(Math.round(last.monto)));
      })
      .catch(() => {
        /* si falla, se queda el default */
      });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const qty = Math.max(0, cantidad);
  const total = Math.max(0, Number(costoGeneral) || 0);
  const unitCost = qty > 0 ? Math.round(total / qty) : 0;
  const stockAfter = product.stock + qty;
  const capacity = Math.max(product.stockMaximo, stockAfter, 1);
  const currentPct = Math.min(100, (product.stock / capacity) * 100);
  const addedPct = Math.min(100 - currentPct, (qty / capacity) * 100);
  const gain = product.precioVenta - unitCost;
  const meta = [product.nombre, product.categoria, product.linea].filter(Boolean).join(' · ');

  function changeQty(next: number) {
    setCantidad(Math.max(1, next));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (qty < 1) {
      setError('Indica cuántas unidades llegaron');
      return;
    }
    if (total <= 0) {
      setError('Indica el costo de la compra');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/gastos', {
        categoria: 'compra-productos',
        concepto: `Compra de ${product.nombre}`,
        monto: total,
        productoId: product.id,
        nota: `${qty} uds · costo general ${pesos(total)}`,
      });
      await api.patch(`/productos/${product.id}`, {
        nombre: product.nombre,
        categoria: product.categoria,
        linea: product.linea,
        ...(product.fechaVencimiento ? { fechaVencimiento: product.fechaVencimiento } : {}),
        costo: unitCost,
        precioVenta: product.precioVenta,
        stock: stockAfter,
        stockMaximo: Math.max(product.stockMaximo, stockAfter),
        stockMinimo: product.stockMinimo,
        ...(product.imagen ? { imagen: product.imagen } : {}),
      });
      await onSaved();
    } catch (caught) {
      setError(readError(caught));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal buy-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div>
          <h2>Reabastecer</h2>
          <p className="product-meta">{meta}</p>
        </div>

        <div className="buy-fields">
          <label className="field">
            <span>Cantidad</span>
            <div className="buy-qty">
              <button type="button" aria-label="Quitar una" onClick={() => changeQty(qty - 1)}>
                −
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={cantidad}
                onChange={(event) => changeQty(Number(event.target.value) || 1)}
                required
              />
              <button type="button" aria-label="Agregar una" onClick={() => changeQty(qty + 1)}>
                +
              </button>
            </div>
          </label>

          <div className="field">
            <div className="buy-cost-label">
              <span>Costo</span>
              <em>Antes: {pesos(product.costo)}</em>
            </div>
            <MoneyField label="" sign value={costoGeneral} onChange={setCostoGeneral} required />
          </div>
        </div>

        <div className="buy-summary">
          <div className="buy-stock-row">
            <span>Stock</span>
            <strong>
              {product.stock} → {stockAfter} / {capacity} uds
            </strong>
          </div>
          <div className="stock-track buy-stock-track" aria-hidden="true">
            <span style={{ width: `${currentPct}%` }} />
            <span className="is-added" style={{ width: `${addedPct}%` }} />
          </div>
          <p className="buy-summary-line">
            <span>Costo unitario</span>
            <strong>{pesos(unitCost)}</strong>
          </p>
          <p className="buy-summary-line">
            <span>Ganancia</span>
            <strong className={gain < 0 ? 'is-gain is-negative' : 'is-gain'}>{pesos(gain)}</strong>
          </p>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <div className="card-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Registrar compra'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function parsePurchaseQuantity(nota?: string) {
  if (!nota) return null;
  const match = nota.match(/^([\d.]+)\s+/);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : null;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}

export function CategoryIcon({ name }: { name: Filter }) {
  if (name === 'Todos') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="6" y="7" width="8" height="8" rx="2" />
        <rect x="18" y="7" width="8" height="8" rx="2" />
        <rect x="6" y="17" width="8" height="8" rx="2" />
        <rect x="18" y="17" width="8" height="8" rx="2" />
      </svg>
    );
  }
  if (name === 'Café') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8 12h13v6.5a5.5 5.5 0 0 1-5.5 5.5h-2A5.5 5.5 0 0 1 8 18.5V12z" />
        <path d="M21 14.5h2.2a2.8 2.8 0 0 1 0 5.6H21" />
        <path d="M12 8.5c.4 1.2-.2 2-.2 2M16 8c.4 1.2-.2 2-.2 2" />
      </svg>
    );
  }
  if (name === 'Jugos naturales') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M11 10h10l-1.2 14.2a3 3 0 0 1-3 2.8h-1.6a3 3 0 0 1-3-2.8L11 10z" />
        <path d="M10 10h12" />
        <path d="M18 10c.6-2.2 2.4-3.2 4-2.6" />
      </svg>
    );
  }
  if (name === 'Bebidas') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M13 7h6l1 4v14a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V11l1-4z" />
        <path d="M12 11h8" />
      </svg>
    );
  }
  if (name === 'Fritos') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8 18c2-5 5-8 8-8s6 3 8 8c-2 5-5 8-8 8s-6-3-8-8z" />
        <path d="M12 16h.01M17 14h.01M19 19h.01" />
      </svg>
    );
  }
  if (name === 'Mecato') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M11 9h10l1.5 4.5H9.5L11 9z" />
        <path d="M10 13.5h12l-1 12.5a2 2 0 0 1-2 1.8h-6a2 2 0 0 1-2-1.8L10 13.5z" />
      </svg>
    );
  }
  if (name === 'Dulces') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M12 12h8v8h-8z" />
        <path d="M8 14 4.5 10.5M8 18 4.5 21.5M24 14l3.5-3.5M24 18l3.5 3.5" />
      </svg>
    );
  }
  if (name === 'Lácteos') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M12 8h8l1.2 4H10.8L12 8z" />
        <path d="M10.5 12h11l-.8 13.2a2 2 0 0 1-2 1.8h-5.4a2 2 0 0 1-2-1.8L10.5 12z" />
      </svg>
    );
  }
  if (name === 'Papelería') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M10 26 22 8l2.5 1.5L12.5 27.5 9 28z" />
        <path d="M20.5 9.5 23 11" />
      </svg>
    );
  }
  if (name === 'Aseo') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M12 10h8v4H12z" />
        <path d="M11 14h10l-1 12H12l-1-12z" />
        <path d="M16 7v3" />
      </svg>
    );
  }
  if (name === 'Medicamentos') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="8" y="8" width="16" height="16" rx="4" />
        <path d="M16 12v8M12 16h8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 20.5 16 8l9 12.5" />
      <path d="M8 20.5h16v3.2a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3.2z" />
      <path d="M16 8v12.5" />
    </svg>
  );
}

function CupIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 12h12v7.2A6 6 0 0 1 8 19.2V12z" />
      <path d="M20 14.2h2.4a2.6 2.6 0 0 1 0 5.2H20" />
    </svg>
  );
}

const EXPIRY_SOON_DAYS = 7;

export function formatExpiry(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function expiryTone(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '';
  const expiry = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'is-expired';
  if (diffDays <= EXPIRY_SOON_DAYS) return 'is-soon';
  return '';
}

function pesos(value: number) {
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return `$${formatted}`;
}

function formatUpdated(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
    .format(date)
    .replace('.', '');
  const time = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `Actualizado ${day} · ${time}`;
}

function readError(caught: unknown) {
  if (!axios.isAxiosError(caught)) return 'No se pudo guardar el producto';
  const message = caught.response?.data?.message;
  if (Array.isArray(message)) return String(message[0]);
  if (typeof message === 'string') return message;
  return 'No se pudo guardar el producto';
}

