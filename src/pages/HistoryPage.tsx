import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { expenseCategoryLabel } from './ExpensesPage';

type KindFilter = 'todo' | 'ventas' | 'gastos' | 'producto';
type RangeFilter = 'hoy' | 'mas';
type Payment = 'efectivo' | 'transferencia';

interface SaleItem {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

interface Sale {
  id: string;
  metodoPago: Payment;
  total: number;
  montoRecibido?: number;
  cambio?: number;
  items: SaleItem[];
  createdAt: string;
}

interface ExpenseRow {
  id: string;
  categoria: string;
  concepto: string;
  monto: number;
  nota?: string;
  createdAt: string;
}

interface MovementItem extends SaleItem {
  showCantidad?: boolean;
  unidad?: string;
}

interface Movement {
  id: string;
  kind: 'venta' | 'gasto' | 'producto';
  label: string;
  createdAt: Date;
  payment?: Payment;
  categoryLabel?: string;
  categoryType?: string;
  amount: number;
  items: MovementItem[];
  montoRecibido?: number;
  cambio?: number;
}

export function HistoryPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<KindFilter>('todo');
  const [range, setRange] = useState<RangeFilter>('hoy');
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Movement | null>(null);

  async function load() {
    const [salesResponse, expensesResponse] = await Promise.all([
      api.get<Sale[]>('/ventas'),
      api.get<ExpenseRow[]>('/gastos'),
    ]);
    setSales(salesResponse.data);
    setExpenses(expensesResponse.data);
  }

  useEffect(() => {
    load()
      .catch(() => setError('No se pudieron cargar los movimientos'))
      .finally(() => setLoading(false));
  }, []);

  const movements = useMemo((): Movement[] => {
    const saleMovements: Movement[] = [...sales]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((sale, index) => ({
        id: sale.id,
        kind: 'venta' as const,
        label: `Venta ${String(index + 1).padStart(3, '0')}`,
        createdAt: new Date(sale.createdAt),
        payment: sale.metodoPago,
        amount: sale.total,
        items: sale.items,
        montoRecibido: sale.montoRecibido,
        cambio: sale.cambio,
      }));

    const generalExpenses = expenses.filter((expense) => expense.categoria !== 'compra-productos');
    const productPurchases = expenses.filter((expense) => expense.categoria === 'compra-productos');

    const expenseMovements: Movement[] = [...generalExpenses]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((expense, index) => ({
        id: expense.id,
        kind: 'gasto' as const,
        label: `Gasto ${String(index + 1).padStart(3, '0')}`,
        createdAt: new Date(expense.createdAt),
        categoryLabel: expense.concepto,
        categoryType: expenseCategoryLabel(expense.categoria),
        amount: expense.monto,
        items: [expenseToLine(expense)],
      }));

    const productMovements: Movement[] = [...productPurchases]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((expense, index) => ({
        id: expense.id,
        kind: 'producto' as const,
        label: `Compra ${String(index + 1).padStart(3, '0')}`,
        createdAt: new Date(expense.createdAt),
        categoryLabel: expense.concepto,
        categoryType: expenseCategoryLabel(expense.categoria),
        amount: expense.monto,
        items: [expenseToLine(expense)],
      }));

    return [...saleMovements, ...expenseMovements, ...productMovements].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }, [sales, expenses]);

  const visible = useMemo(() => {
    const start = startOfToday();
    const dayBounds = range === 'mas' ? dayBoundsFromInput(selectedDate) : null;
    const term = query.trim().toLowerCase();
    return movements.filter((item) => {
      if (kind === 'ventas' && item.kind !== 'venta') return false;
      if (kind === 'gastos' && item.kind !== 'gasto') return false;
      if (kind === 'producto' && item.kind !== 'producto') return false;
      if (range === 'hoy' && item.createdAt < start) return false;
      if (dayBounds) {
        if (item.createdAt < dayBounds.start || item.createdAt > dayBounds.end) return false;
      }
      if (range !== 'mas' || !term) return true;
      const haystack = [
        item.label,
        item.payment ? paymentLabel(item.payment) : '',
        item.categoryLabel ?? '',
        ...item.items.map((line) => line.nombre),
        String(item.amount),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [movements, kind, range, query, selectedDate]);

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((item) => item.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  const selected = visible.find((item) => item.id === selectedId) ?? null;
  const latestId = visible[0]?.id ?? null;
  const onLatest = Boolean(selectedId && latestId && selectedId === latestId);

  const summarySource = useMemo(() => {
    const start = startOfToday();
    return movements.filter((item) => item.createdAt >= start);
  }, [movements]);

  const soldToday = summarySource
    .filter((item) => item.kind === 'venta')
    .reduce((sum, item) => sum + item.amount, 0);
  const spentToday = summarySource
    .filter((item) => item.kind === 'gasto' || item.kind === 'producto')
    .reduce((sum, item) => sum + item.amount, 0);
  const cashToday = summarySource
    .filter((item) => item.kind === 'venta' && item.payment === 'efectivo')
    .reduce((sum, item) => sum + item.amount, 0);
  const transferToday = summarySource
    .filter((item) => item.kind === 'venta' && item.payment === 'transferencia')
    .reduce((sum, item) => sum + item.amount, 0);

  async function confirmRemoveMovement() {
    if (!pendingDelete) return;
    setRemoving(true);
    setError('');
    try {
      if (pendingDelete.kind === 'venta') {
        await api.delete(`/ventas/${pendingDelete.id}`);
      } else {
        await api.delete(`/gastos/${pendingDelete.id}`);
      }
      setPendingDelete(null);
      await load();
    } catch {
      setError('No se pudo eliminar el movimiento');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="history">
      <div className="history-board">
        <header className="category-head">
          <h1>Movimientos</h1>
          <div className="history-filters">
            <div className="history-segment" role="tablist" aria-label="Periodo">
              <button
                className={range === 'hoy' ? 'history-segment-btn is-active' : 'history-segment-btn'}
                type="button"
                role="tab"
                aria-selected={range === 'hoy'}
                onClick={() => {
                  setRange('hoy');
                  setQuery('');
                }}
              >
                Hoy
              </button>
              <button
                className={range === 'mas' ? 'history-segment-btn is-active' : 'history-segment-btn'}
                type="button"
                role="tab"
                aria-selected={range === 'mas'}
                onClick={() => {
                  setRange('mas');
                  setSelectedDate((current) => current || toDateInputValue(new Date()));
                }}
              >
                Más movimientos
              </button>
            </div>

            {range === 'mas' ? (
              <>
                <label className="search-field history-search-wrap">
                  <input
                    className="search history-search"
                    value={query}
                    placeholder="Buscar movimiento..."
                    aria-label="Buscar movimiento"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <SearchIcon />
                </label>
                <label className="history-date-field">
                  <span className="sr-only">Fecha</span>
                  <input
                    className="history-date"
                    type="date"
                    value={selectedDate}
                    max={toDateInputValue(new Date())}
                    aria-label="Elegir día"
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>
        </header>

        <div className="category-row history-kind-row" role="tablist" aria-label="Tipo">
          {(
            [
              ['todo', 'Todo'],
              ['ventas', 'Ventas'],
              ['gastos', 'Gastos'],
              ['producto', 'Producto'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={kind === id ? 'category-card is-active' : 'category-card'}
              type="button"
              role="tab"
              aria-selected={kind === id}
              onClick={() => setKind(id)}
            >
              <KindIcon name={id} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="sale-menu-head">
          <h2>{kindLabel(kind)}</h2>
          <span>{rangeLabel(range, selectedDate)}</span>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <p className="muted-line">Cargando movimientos…</p> : null}
        {!loading && visible.length === 0 ? (
          <p className="muted-line">
            {kind === 'producto'
              ? 'Aún no hay compras de producto. Regístralas desde Reabastecer en Productos.'
              : range === 'hoy'
                ? 'No hay movimientos para hoy.'
                : `No hay movimientos para ${formatPickedDate(selectedDate)}.`}
          </p>
        ) : null}

        <div className="history-list">
          {visible.map((item) => {
            const active = item.id === selectedId;
            const isSale = item.kind === 'venta';
            return (
              <article
                key={item.id}
                className={active ? 'history-row is-active' : 'history-row'}
                onClick={() => setSelectedId(item.id)}
              >
                <span className={isSale ? 'history-mark is-in' : 'history-mark is-out'} aria-hidden="true">
                  {isSale ? <ArrowUpIcon /> : <ArrowDownIcon />}
                </span>

                <div className="history-copy">
                  <strong>{item.label}</strong>
                  <em>{formatTime(item.createdAt)}</em>
                </div>

                <div className="history-trail">
                  <span className="history-brief" title={movementBrief(item)}>
                    {movementBrief(item)}
                  </span>
                  {item.kind === 'venta' && item.payment ? (
                    <span className="history-pay">{paymentLabel(item.payment)}</span>
                  ) : item.categoryType ? (
                    <span className="history-pay">{item.categoryType}</span>
                  ) : null}
                </div>

                <b className={isSale ? 'history-amount is-in' : 'history-amount is-out'}>
                  {isSale ? '+' : '-'}
                  {pesos(item.amount)}
                </b>
              </article>
            );
          })}
        </div>

        <div className="history-summary">
          <div className="summary-card">
            <p>Vendido hoy</p>
            <strong>{pesos(soldToday)}</strong>
          </div>
          <div className="summary-card">
            <p>Gastos hoy</p>
            <strong>{pesos(spentToday)}</strong>
          </div>
          <div className="summary-card">
            <p>Efectivo</p>
            <strong>{pesos(cashToday)}</strong>
          </div>
          <div className="summary-card">
            <p>Transferencia</p>
            <strong>{pesos(transferToday)}</strong>
          </div>
        </div>
      </div>

      <aside className={selected ? 'history-panel' : 'history-panel is-empty'}>
        {selected ? (
          <>
            <div className="history-panel-head">
              <h2>
                {selected.kind === 'venta'
                  ? 'Detalle de venta'
                  : selected.kind === 'producto'
                    ? 'Detalle de compra'
                    : 'Detalle de gasto'}
              </h2>
              <p>
                {selected.label} · {formatTime(selected.createdAt)}
              </p>
            </div>

            <ul className="history-lines">
              {selected.items.map((line) => (
                <li key={`${selected.id}-${line.productoId}-${line.nombre}`}>
                  <span>
                    {line.nombre}
                    {selected.kind === 'venta' || line.showCantidad ? (
                      <em> {formatLineQuantity(line, selected.kind === 'venta')}</em>
                    ) : null}
                  </span>
                  <strong>{pesos(line.subtotal)}</strong>
                </li>
              ))}
            </ul>

            <div className="history-panel-foot">
              <p className="history-total">
                <span>Total</span>
                <strong>{pesos(selected.amount)}</strong>
              </p>

              <dl className="history-meta">
                {selected.kind === 'venta' && selected.payment ? (
                  <>
                    <div>
                      <dt>Método de pago</dt>
                      <dd>{paymentLabel(selected.payment)}</dd>
                    </div>
                    {selected.payment === 'efectivo' ? (
                      <>
                        <div>
                          <dt>Recibido</dt>
                          <dd>
                            {selected.montoRecibido != null ? pesos(selected.montoRecibido) : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>Devuelto</dt>
                          <dd className="is-gain">
                            {selected.cambio != null
                              ? pesos(selected.cambio)
                              : selected.montoRecibido != null
                                ? pesos(Math.max(0, selected.montoRecibido - selected.amount))
                                : '—'}
                          </dd>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div>
                      <dt>Concepto</dt>
                      <dd>{selected.categoryLabel ?? 'Gasto'}</dd>
                    </div>
                    {selected.items.some((line) => line.showCantidad) ? (
                      <div>
                        <dt>Cantidad</dt>
                        <dd>
                          {selected.items
                            .filter((line) => line.showCantidad)
                            .map((line) => formatMetaQuantity(line))
                            .join(', ')}
                        </dd>
                      </div>
                    ) : null}
                  </>
                )}
              </dl>

              <div className="history-actions">
                <button
                  className="button button-quiet history-latest"
                  type="button"
                  disabled={!latestId || onLatest}
                  onClick={() => {
                    if (latestId) setSelectedId(latestId);
                  }}
                >
                  Último movimiento
                </button>
                <button
                  className="button button-quiet icon-button"
                  type="button"
                  aria-label="Eliminar movimiento"
                  disabled={removing}
                  onClick={() => setPendingDelete(selected)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16" />
                    <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
                    <path d="M6.5 7l.8 12.2A1.8 1.8 0 0 0 9.1 21h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7" />
                    <path d="M10 11.2v6" />
                    <path d="M14 11.2v6" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="muted-line">Selecciona un movimiento para ver el detalle.</p>
        )}
      </aside>

      {pendingDelete ? (
        <ConfirmDialog
          title="Eliminar movimiento"
          message={
            pendingDelete.kind === 'venta'
              ? `¿Eliminar ${pendingDelete.label}? Se deshará la venta.`
              : pendingDelete.kind === 'producto'
                ? `¿Eliminar ${pendingDelete.label}? Se deshará la compra.`
                : `¿Eliminar ${pendingDelete.label}? Se deshará el gasto.`
          }
          confirmLabel="Eliminar"
          busy={removing}
          onCancel={() => {
            if (!removing) setPendingDelete(null);
          }}
          onConfirm={() => void confirmRemoveMovement()}
        />
      ) : null}
    </section>
  );
}

function expenseToLine(expense: ExpenseRow): MovementItem {
  const parsed = parseExpenseQuantity(expense.nota);
  const qty = parsed?.cantidad ?? 1;
  return {
    productoId: expense.id,
    nombre: expense.concepto,
    cantidad: qty,
    precioUnitario: Math.round(expense.monto / qty),
    subtotal: expense.monto,
    showCantidad: parsed != null,
    unidad: parsed?.unidad,
  };
}

function parseExpenseQuantity(nota?: string) {
  if (!nota) return null;
  const match = nota.match(/^([\d.]+)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/);
  if (!match) return null;
  const cantidad = Number(match[1]);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
  const raw = match[2].toLowerCase();
  const unidad = raw === 'lb' || raw === 'lbs' || raw === 'libra' || raw === 'libras' ? 'Lb' : raw === 'uds' || raw === 'ud' || raw === 'unidad' || raw === 'unidades' ? 'uds' : match[2];
  return { cantidad, unidad };
}

function formatLineQuantity(line: MovementItem, isSale: boolean) {
  if (isSale) return `x${line.cantidad}`;
  if (line.unidad === 'Lb') return `x${line.cantidad} Lb`;
  if (line.unidad === 'uds') return `x${line.cantidad} uds`;
  return line.unidad ? `x${line.cantidad} ${line.unidad}` : `x${line.cantidad}`;
}

function formatMetaQuantity(line: MovementItem) {
  if (line.unidad === 'Lb') return `${line.cantidad} Lb`;
  if (line.unidad === 'uds') return `${line.cantidad} uds`;
  return line.unidad ? `${line.cantidad} ${line.unidad}` : `${line.cantidad}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayBoundsFromInput(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { start, end };
}

function formatPickedDate(value: string) {
  const bounds = dayBoundsFromInput(value);
  if (!bounds) return 'ese día';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(bounds.start);
}

function rangeLabel(range: RangeFilter, selectedDate: string) {
  if (range === 'mas') return formatPickedDate(selectedDate);
  const now = new Date();
  const day = now.getDate();
  const month = new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(now).replace('.', '');
  return `Hoy · ${day} ${month} ${now.getFullYear()}`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function paymentLabel(payment: Payment) {
  return payment === 'efectivo' ? 'Efectivo' : 'Transferencia';
}

function movementBrief(item: Movement) {
  if (item.kind === 'venta') {
    return item.items
      .map((line) => (line.cantidad > 1 ? `${line.nombre} ×${line.cantidad}` : line.nombre))
      .join(' · ');
  }
  return item.categoryLabel?.trim() || 'Sin detalle';
}

function kindLabel(kind: KindFilter) {
  if (kind === 'ventas') return 'Ventas';
  if (kind === 'gastos') return 'Gastos';
  if (kind === 'producto') return 'Producto';
  return 'Todo';
}

function KindIcon({ name }: { name: KindFilter }) {
  if (name === 'todo') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="6" y="7" width="8" height="8" rx="2" />
        <rect x="18" y="7" width="8" height="8" rx="2" />
        <rect x="6" y="17" width="8" height="8" rx="2" />
        <rect x="18" y="17" width="8" height="8" rx="2" />
      </svg>
    );
  }
  if (name === 'ventas') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8 10h16l-1.1 12.2a3 3 0 0 1-3 2.8H12.1a3 3 0 0 1-3-2.8L8 10z" />
        <path d="M12 10V8.2A3.2 3.2 0 0 1 15.2 5h1.6A3.2 3.2 0 0 1 20 8.2V10" />
      </svg>
    );
  }
  if (name === 'gastos') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="6" y="10" width="20" height="12" rx="2.5" />
        <path d="M6 14.5h20" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M10 12h12v8.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V12z" />
      <path d="M22 14.5h1.8a2.2 2.2 0 0 1 0 4.4H22" />
      <path d="M13.5 9c.4 1-.2 1.6-.2 1.6M17.5 8.5c.4 1-.2 1.6-.2 1.6" />
    </svg>
  );
}

function pesos(value: number) {
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return `$${formatted}`;
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19V7" />
      <path d="m7 11 5-5 5 5" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v12" />
      <path d="m7 13 5 5 5-5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}
