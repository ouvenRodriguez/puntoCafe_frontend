import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useHorizontalWheelScroll } from '../hooks/useHorizontalWheelScroll';
import {
  CategoryIcon,
  expiryTone,
  FILTERS,
  formatExpiry,
  MoneyField,
  type Filter,
} from './ProductsPage';

interface Product {
  id: string;
  nombre: string;
  categoria: string;
  linea: string;
  fechaVencimiento: string;
  precioVenta: number;
  stock: number;
  imagen: string;
}

interface CartLine {
  product: Product;
  cantidad: number;
}

type Payment = 'efectivo' | 'transferencia';

/** Al salir de Venta, la cuenta pendiente se limpia si no vuelves en este tiempo. */
const CART_AWAY_MS = 60 * 1000;

const saleDraft: {
  cart: CartLine[];
  payment: Payment;
  recibo: string;
  filter: Filter;
  query: string;
  leftAt: number;
} = {
  cart: [],
  payment: 'efectivo',
  recibo: '',
  filter: 'Todos',
  query: '',
  leftAt: 0,
};

function clearSaleDraft() {
  saleDraft.cart = [];
  saleDraft.payment = 'efectivo';
  saleDraft.recibo = '';
  saleDraft.leftAt = 0;
}

function saleDraftExpired() {
  return Boolean(saleDraft.leftAt && Date.now() - saleDraft.leftAt >= CART_AWAY_MS);
}

export function SalesPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState(saleDraft.query);
  const [filter, setFilter] = useState<Filter>(saleDraft.filter);
  const [cart, setCart] = useState<CartLine[]>(() => {
    if (saleDraftExpired()) {
      clearSaleDraft();
      return [];
    }
    saleDraft.leftAt = 0;
    return saleDraft.cart;
  });
  const [payment, setPayment] = useState<Payment>(saleDraft.payment);
  const [charging, setCharging] = useState(false);
  const [confirmCharge, setConfirmCharge] = useState(false);
  const [recibo, setRecibo] = useState(saleDraft.recibo);
  const [reciboTip, setReciboTip] = useState('');
  const categoryRowRef = useRef<HTMLDivElement>(null);
  const reciboInputRef = useRef<HTMLInputElement>(null);

  useHorizontalWheelScroll(categoryRowRef);

  async function load() {
    const response = await api.get<Product[]>('/productos');
    setProducts(response.data);
  }

  useEffect(() => {
    load()
      .catch(() => setError('No se pudieron cargar los productos'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    saleDraft.cart = cart;
    saleDraft.payment = payment;
    saleDraft.recibo = recibo;
    saleDraft.filter = filter;
    saleDraft.query = query;
    saleDraft.leftAt = 0;
  }, [cart, payment, recibo, filter, query]);

  // El temporizador solo corre fuera de Venta.
  useEffect(() => {
    saleDraft.leftAt = 0;
    return () => {
      saleDraft.leftAt = saleDraft.cart.length > 0 ? Date.now() : 0;
    };
  }, []);

  useEffect(() => {
    if (loading || products.length === 0) return;
    setCart((lines) =>
      lines.flatMap((line) => {
        const fresh = products.find((product) => product.id === line.product.id);
        if (!fresh || fresh.stock <= 0) return [];
        if (fresh.fechaVencimiento && expiryTone(fresh.fechaVencimiento) === 'is-expired') return [];
        return [{ product: fresh, cantidad: Math.min(line.cantidad, fresh.stock) }];
      }),
    );
  }, [products, loading]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter((product) => filter === 'Todos' || product.categoria === filter)
      .filter((product) => !term || product.nombre.toLowerCase().includes(term))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  }, [products, filter, query]);

  const total = cart.reduce((sum, line) => sum + Number(line.product.precioVenta) * line.cantidad, 0);
  const received = recibo === '' ? 0 : Number(recibo);
  const needsCash = payment === 'efectivo';
  const short = needsCash && received < total;
  const dueBack = Math.max(0, received - total);
  const missing = Math.max(0, total - received);
  const canCharge = cart.length > 0 && !charging && !short;

  useEffect(() => {
    if (!short) setReciboTip('');
  }, [short]);

  function quantityOf(productId: string) {
    return cart.find((line) => line.product.id === productId)?.cantidad ?? 0;
  }

  function addProduct(product: Product) {
    setNotice('');
    setError('');
    if (product.fechaVencimiento && expiryTone(product.fechaVencimiento) === 'is-expired') {
      setError(`${product.nombre} está vencido`);
      return;
    }
    const current = quantityOf(product.id);
    if (product.stock <= 0 || current >= product.stock) {
      setError(`No hay más stock de ${product.nombre}`);
      return;
    }
    setCart((lines) => {
      const existing = lines.find((line) => line.product.id === product.id);
      if (!existing) return [...lines, { product, cantidad: 1 }];
      return lines.map((line) =>
        line.product.id === product.id ? { ...line, product, cantidad: line.cantidad + 1 } : line,
      );
    });
  }

  function changeQuantity(productId: string, next: number) {
    setNotice('');
    const line = cart.find((item) => item.product.id === productId);
    if (!line) return;
    if (next > line.product.stock) {
      setError(`No hay más stock de ${line.product.nombre}`);
      return;
    }
    setError('');
    setCart((lines) => {
      if (next <= 0) return lines.filter((item) => item.product.id !== productId);
      return lines.map((item) => (item.product.id === productId ? { ...item, cantidad: next } : item));
    });
  }

  function requestCharge() {
    if (charging) return;
    setNotice('');
    setError('');
    setReciboTip('');
    if (cart.length === 0) {
      setError('Agrega productos a la cuenta');
      return;
    }
    if (needsCash && short) {
      const tip =
        recibo === ''
          ? 'Rellena este campo para continuar'
          : `Aún faltan ${pesos(missing)} por recibir`;
      setReciboTip(tip);
      reciboInputRef.current?.focus();
      return;
    }
    setConfirmCharge(true);
  }

  async function charge() {
    if (!canCharge) return;
    setCharging(true);
    setError('');
    setNotice('');
    try {
      await api.post('/ventas', {
        metodoPago: payment,
        ...(payment === 'efectivo' ? { montoRecibido: received } : {}),
        items: cart.map((line) => ({ productoId: line.product.id, cantidad: line.cantidad })),
      });
      clearSaleDraft();
      setCart([]);
      setRecibo('');
      setConfirmCharge(false);
      setNotice('Venta registrada');
      await load();
    } catch (caught) {
      setError(readError(caught));
      setConfirmCharge(false);
    } finally {
      setCharging(false);
    }
  }

  const initial = (user?.nombre ?? 'Caja').trim().charAt(0).toUpperCase();

  return (
    <section className="sale">
      <div className="sale-board">
        <header className="category-head">
          <h1>Categorías</h1>
          <label className="search-field">
            <input
              className="search"
              value={query}
              placeholder="Buscar producto..."
              aria-label="Buscar producto"
              onChange={(event) => setQuery(event.target.value)}
            />
            <SearchIcon />
          </label>
        </header>

        <div className="category-row" ref={categoryRowRef} role="tablist" aria-label="Categorías">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? 'category-card is-active' : 'category-card'}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              <CategoryIcon name={item.id} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sale-menu-head">
          <h2>{filter === 'Todos' ? 'Productos' : filter}</h2>
          <span>
            {visible.length} {visible.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>

        <div className="sale-catalog">
        {loading ? <p className="muted-line">Cargando productos…</p> : null}
        {!loading && visible.length === 0 ? (
          <p className="muted-line">No hay productos para vender con ese filtro.</p>
        ) : null}

        <div className="sale-grid">
          {visible.map((product) => {
            const inCart = quantityOf(product.id);
            const noStock = product.stock <= 0;
            const expired =
              Boolean(product.fechaVencimiento) &&
              expiryTone(product.fechaVencimiento) === 'is-expired';
            const atLimit = inCart >= product.stock;
            const blocked = noStock || expired || atLimit;
            const statusLabel = expired ? 'Vencido' : noStock ? 'Sin stock' : pesos(product.precioVenta);
            return (
              <button
                key={product.id}
                className={[
                  'sale-card',
                  inCart > 0 ? 'is-in-bill' : '',
                  noStock || expired ? 'is-sold-out' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                disabled={blocked}
                aria-disabled={blocked}
                onClick={() => addProduct(product)}
              >
                <span className="sale-visual">
                  <span className="sale-photo">
                    {product.imagen ? <img src={product.imagen} alt="" /> : <span>Foto</span>}
                  </span>
                  {product.fechaVencimiento ? (
                    <span className={`sale-expiry ${expiryTone(product.fechaVencimiento)}`.trim()}>
                      Vence {formatExpiry(product.fechaVencimiento)}
                    </span>
                  ) : null}
                </span>
                <span className="sale-copy">
                  <strong>{product.nombre}</strong>
                  {product.linea ? <em>{product.linea}</em> : <em>{product.categoria}</em>}
                  <b>{statusLabel}</b>
                </span>
                {inCart > 0 ? <span className="sale-count">{inCart}</span> : null}
              </button>
            );
          })}
        </div>
        </div>
      </div>

      <aside className="sale-bill">
        <div className="bill-user">
          <span>{initial}</span>
          <div>
            <strong>{user?.nombre ?? 'Caja'}</strong>
            <em>Caja</em>
          </div>
        </div>

        <h2>Cuenta</h2>
        <div className="bill-scroll">
          {cart.length === 0 ? <p className="muted-line">Toca un producto para agregarlo.</p> : null}
          <ul className="bill-lines">
            {cart.map((line) => (
              <li key={line.product.id}>
                <span className="bill-photo">
                  {line.product.imagen ? <img src={line.product.imagen} alt="" /> : <span>Foto</span>}
                </span>
                <div>
                  <strong>{line.product.nombre}</strong>
                  <div className="qty-stepper">
                    <button type="button" onClick={() => changeQuantity(line.product.id, line.cantidad - 1)} aria-label="Quitar una">
                      −
                    </button>
                    <span>{line.cantidad}</span>
                    <button
                      type="button"
                      disabled={line.cantidad >= line.product.stock}
                      onClick={() => changeQuantity(line.product.id, line.cantidad + 1)}
                      aria-label="Agregar una"
                    >
                      +
                    </button>
                  </div>
                </div>
                <b>{pesos(line.product.precioVenta * line.cantidad)}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="bill-foot">
        <div className="bill-totals">
          <p>
            <span>Subtotal</span>
            <strong>{pesos(total)}</strong>
          </p>
          <p>
            <span>Total</span>
            <strong>{pesos(total)}</strong>
          </p>
        </div>

        <h3>Método de pago</h3>
        <div className="pay-row">
          <button
            className={payment === 'efectivo' ? 'pay-card is-active' : 'pay-card'}
            type="button"
            onClick={() => setPayment('efectivo')}
          >
            <CashIcon />
            Efectivo
          </button>
          <button
            className={payment === 'transferencia' ? 'pay-card is-active' : 'pay-card'}
            type="button"
            onClick={() => setPayment('transferencia')}
          >
            <TransferIcon />
            Transferencia
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="sale-notice">{notice}</p> : null}
        <form
          className="sale-charge-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            requestCharge();
          }}
        >
          <div className={reciboTip ? 'bill-cash has-tip' : 'bill-cash'}>
            <div className="bill-recibo">
              <MoneyField
                label="Recibo"
                sign
                inputRef={reciboInputRef}
                value={recibo}
                onChange={(digits) => {
                  setRecibo(digits);
                  setError('');
                  setReciboTip('');
                }}
              />
              {reciboTip ? (
                <p className="field-tip" role="alert">
                  <span className="field-tip-mark" aria-hidden="true">
                    !
                  </span>
                  {reciboTip}
                </p>
              ) : null}
            </div>
            <p className={short ? 'bill-change is-short' : 'bill-change'}>
              <span>{short ? 'Falta' : 'Devolver'}</span>
              <strong>{pesos(short ? missing : dueBack)}</strong>
            </p>
          </div>
          <button
            className="button sale-charge"
            type="submit"
            disabled={charging || cart.length === 0}
          >
            {charging ? 'Registrando…' : 'Registrar venta'}
          </button>
        </form>
        </div>
      </aside>

      {confirmCharge ? (
        <ConfirmDialog
          title="Registrar venta"
          message={`¿Registrar esta venta por ${pesos(total)}?`}
          confirmLabel="Registrar venta"
          cancelLabel="Cancelar"
          busyLabel="Registrando…"
          danger={false}
          busy={charging}
          onCancel={() => {
            if (!charging) setConfirmCharge(false);
          }}
          onConfirm={() => void charge()}
        />
      ) : null}
    </section>
  );
}

function pesos(value: number) {
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return `$${formatted}`;
}

function readError(caught: unknown) {
  if (!axios.isAxiosError(caught)) return 'No se pudo registrar la venta';
  const message = caught.response?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string') return message;
  return 'No se pudo registrar la venta';
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="5" y="9" width="22" height="14" rx="3" />
      <circle cx="16" cy="16" r="3.2" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 12h16" />
      <path d="M18 8l5 4-5 4" />
      <path d="M25 20H9" />
      <path d="M14 16l-5 4 5 4" />
    </svg>
  );
}
