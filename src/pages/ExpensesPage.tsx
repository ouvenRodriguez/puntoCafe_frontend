import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { api } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useHorizontalWheelScroll } from '../hooks/useHorizontalWheelScroll';
import { MoneyField } from './ProductsPage';

interface ExpenseRow {
  id: string;
  categoria: string;
  concepto: string;
  monto: number;
  nota?: string;
  createdAt: string;
  updatedAt?: string;
}

interface FrequentConcept {
  concepto: string;
  costo: number;
  cantidad?: number;
}

const PRODUCT_PURCHASE_TYPE = {
  id: 'compra-productos',
  label: 'Compra de productos',
  title: 'Compra de productos para revender',
  classification: 'Mercancía para la venta',
  text: 'Ejemplos: gaseosas, agua, papas de paquete.',
} as const;

export const EXPENSE_TYPES = [
  {
    id: 'retiro-dinero',
    label: 'Retiro de dinero',
    title: 'Retiro de dinero',
    classification: 'Retiro de caja',
    text: 'Ejemplos: retiro personal, anticipo, efectivo sacado.',
  },
  {
    id: 'materia-prima',
    label: 'Materia prima',
    title: 'Compra de materia prima',
    classification: 'Materia prima',
    text: 'Ejemplos: café, leche, azúcar, harina.',
  },
  {
    id: 'empaques',
    label: 'Empaques',
    title: 'Empaques',
    classification: 'Materiales de empaque',
    text: 'Ejemplos: vasos, servilletas, bolsas.',
  },
  {
    id: 'pago-empleados',
    label: 'Pago de empleados',
    title: 'Pago de empleados',
    classification: 'Gasto de personal',
    text: 'Ejemplos: sueldos del personal.',
  },
  {
    id: 'arriendo',
    label: 'Arriendo',
    title: 'Arriendo del local',
    classification: 'Gasto de arrendamiento',
    text: 'Ejemplo: pago mensual del establecimiento.',
  },
  {
    id: 'servicios',
    label: 'Servicios públicos',
    title: 'Servicios públicos',
    classification: 'Gastos de servicios públicos',
    text: 'Ejemplos: agua, luz, internet.',
  },
] as const;

type ExpenseCategory = (typeof EXPENSE_TYPES)[number]['id'];
type Filter = 'Todos' | ExpenseCategory;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'Todos', label: 'Todos' },
  ...EXPENSE_TYPES.map((item) => ({ id: item.id as Filter, label: item.label })),
];

const QUANTITY_TYPES = new Set<ExpenseCategory>(['materia-prima', 'empaques']);

export function ExpensesPage() {
  const [filter, setFilter] = useState<Filter>('retiro-dinero');
  const [error, setError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const categoryRowRef = useRef<HTMLDivElement>(null);
  const activeType = EXPENSE_TYPES.find((item) => item.id === filter) ?? null;
  const ledgerCategory = activeType?.id ?? null;

  useHorizontalWheelScroll(categoryRowRef);

  const ledgerRows = useMemo(() => {
    const rows =
      filter === 'Todos'
        ? expenses
        : expenses.filter((item) => item.categoria === filter);
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [expenses, filter]);

  async function loadExpenses() {
    const response = await api.get<ExpenseRow[]>('/gastos');
    setExpenses(response.data.filter((item) => item.categoria !== 'compra-productos'));
  }

  useEffect(() => {
    loadExpenses().catch(() => setError('No se pudieron cargar los gastos'));
  }, []);

  return (
    <section className="products expenses">
      <div className="category-head">
        <h1>Tipo de gasto</h1>
      </div>

      <div
        className="category-row expense-category-row"
        ref={categoryRowRef}
        role="tablist"
        aria-label="Tipo de gasto"
      >
        {FILTERS.map((item) => (
          <button
            key={item.id}
            className={filter === item.id ? 'category-card is-active' : 'category-card'}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => {
              setFilter(item.id);
              setError('');
              setSavedNote('');
            }}
          >
            <ExpenseIcon name={item.id} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="expense-workspace">
        {activeType ? (
          <ExpenseComposer
            key={activeType.id}
            category={activeType.id}
            history={expenses.filter((item) => item.categoria === activeType.id)}
            onSaved={async () => {
              setError('');
              setSavedNote('Gasto registrado. Lo ves en Historial → Gastos.');
              await loadExpenses();
            }}
            onError={(message) => {
              setSavedNote('');
              setError(message);
            }}
          />
        ) : (
          <article className="welcome-card expense-pick-card">
            <p className="welcome-copy">
              Elige un tipo de gasto para registrarlo. Abajo ves el historial reciente.
            </p>
          </article>
        )}

        {error ? <p className="form-error">{error}</p> : null}
        {savedNote ? <p className="muted-line">{savedNote}</p> : null}

        <ExpenseLedger
          title={
            ledgerCategory
              ? `Últimos gastos de ${EXPENSE_TYPES.find((item) => item.id === ledgerCategory)?.label.toLowerCase()}`
              : 'Últimos gastos'
          }
          rows={ledgerRows}
          usesQuantity={ledgerCategory ? QUANTITY_TYPES.has(ledgerCategory) : false}
          quantityUnit={ledgerCategory === 'materia-prima' ? 'Lb' : 'uds'}
          showCategory={filter === 'Todos'}
        />
      </div>
    </section>
  );
}

function ExpenseComposer({
  category,
  history,
  onSaved,
  onError,
}: {
  category: ExpenseCategory;
  history: ExpenseRow[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const meta = EXPENSE_TYPES.find((item) => item.id === category)!;
  const usesQuantity = QUANTITY_TYPES.has(category);
  const [concepto, setConcepto] = useState('');
  const [cantidad, setCantidad] = useState('0');
  const [costo, setCosto] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const qty = Math.max(0, Number(cantidad) || 0);
  const unitOrAmount = Math.max(0, Number(costo) || 0);
  const total = usesQuantity ? Math.round(qty * unitOrAmount) : unitOrAmount;
  const canRegister = !saving && total > 0 && concepto.trim() && (!usesQuantity || qty > 0);

  const frequents = useMemo(
    () => buildFrequents(history, category, usesQuantity),
    [history, category, usesQuantity],
  );

  function applyFrequent(item: FrequentConcept) {
    setConcepto(item.concepto);
    setCosto(String(Math.round(item.costo)));
    if (usesQuantity && item.cantidad != null) {
      setCantidad(String(item.cantidad));
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canRegister) return;
    setConfirmSave(true);
  }

  async function confirmRegister() {
    if (!canRegister) return;
    setSaving(true);
    onError('');
    try {
      const unitLabel = category === 'materia-prima' ? 'Lb' : 'uds';
      const nota = usesQuantity
        ? `${qty} ${unitLabel} · ${pesos(unitOrAmount)}/${unitLabel}`
        : undefined;
      await api.post('/gastos', {
        categoria: category,
        concepto: concepto.trim(),
        monto: total,
        ...(nota ? { nota } : {}),
      });
      setConcepto('');
      setCantidad('0');
      setCosto('');
      setConfirmSave(false);
      await onSaved();
    } catch (caught) {
      onError(readError(caught));
      setConfirmSave(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="expense-composer" onSubmit={handleSubmit}>
      <div className="expense-composer-head">
        <h2>Registrar {meta.label.toLowerCase()}</h2>
        <p>{formatComposerDate(new Date())}</p>
      </div>

      {frequents.length > 0 ? (
        <div className="expense-frequents" aria-label="Conceptos frecuentes">
          <span>Frecuentes</span>
          <div className="expense-frequent-list">
            {frequents.map((item) => {
              const selected = concepto.trim().toLowerCase() === item.concepto.toLowerCase();
              return (
                <button
                  key={item.concepto}
                  className={selected ? 'expense-frequent is-active' : 'expense-frequent'}
                  type="button"
                  onClick={() => applyFrequent(item)}
                >
                  <strong>{item.concepto}</strong>
                  <em>· {pesos(item.costo)}</em>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={usesQuantity ? 'expense-composer-fields has-qty' : 'expense-composer-fields'}>
        <label className="field">
          <span>Concepto</span>
          <input
            value={concepto}
            onChange={(event) => setConcepto(event.target.value)}
            placeholder={conceptPlaceholder(category)}
            required
          />
        </label>

        {usesQuantity ? (
          <label className="field">
            <span>{category === 'materia-prima' ? 'Cantidad (Lb)' : 'Cantidad'}</span>
            <input
              className="qty-number"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={cantidad}
              required
              onChange={(event) => setCantidad(event.target.value.replace(/[^\d.]/g, ''))}
            />
          </label>
        ) : null}

        <MoneyField
          label={usesQuantity ? 'Costo' : 'Monto'}
          sign
          value={costo}
          onChange={setCosto}
          required
        />
      </div>

      <div className="expense-composer-foot">
        <div>
          <span>Total del gasto</span>
          <strong>{pesos(total)}</strong>
        </div>
        <button className="button expense-register" type="submit" disabled={!canRegister}>
          {saving ? 'Registrando…' : 'Registrar gasto'}
        </button>
      </div>

      {confirmSave ? (
        <ConfirmDialog
          title="Registrar gasto"
          message={`¿Registrar “${concepto.trim()}” por ${pesos(total)}?`}
          confirmLabel="Registrar gasto"
          cancelLabel="Cancelar"
          busyLabel="Registrando…"
          danger={false}
          busy={saving}
          onCancel={() => {
            if (!saving) setConfirmSave(false);
          }}
          onConfirm={() => void confirmRegister()}
        />
      ) : null}
    </form>
  );
}

function ExpenseLedger({
  title,
  rows,
  usesQuantity,
  quantityUnit,
  showCategory,
}: {
  title: string;
  rows: ExpenseRow[];
  usesQuantity: boolean;
  quantityUnit: string;
  showCategory: boolean;
}) {
  return (
    <article className="expense-ledger">
      <div className="expense-ledger-head">
        <h2>{title}</h2>
        <span>{rows.length} registro{rows.length === 1 ? '' : 's'}</span>
      </div>

      {rows.length === 0 ? (
        <p className="muted-line expense-ledger-empty">Todavía no hay gastos en este tipo.</p>
      ) : (
        <div className="expense-ledger-scroll">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Concepto</th>
                {showCategory ? <th>Tipo</th> : null}
                {usesQuantity ? (
                  <>
                    <th>Cantidad</th>
                    <th>Costo por {quantityUnit}</th>
                  </>
                ) : null}
                <th>Total</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((expense) => {
                const parsed = parseExpenseNota(expense.nota);
                const unitCost =
                  usesQuantity && parsed?.cantidad
                    ? parsed.unitCost ?? Math.round(expense.monto / parsed.cantidad)
                    : null;
                return (
                  <tr key={expense.id}>
                    <td>{expense.concepto}</td>
                    {showCategory ? (
                      <td>{expenseCategoryLabel(expense.categoria)}</td>
                    ) : null}
                    {usesQuantity ? (
                      <>
                        <td>
                          {parsed?.cantidad != null
                            ? `${formatQty(parsed.cantidad)} ${quantityUnit}`
                            : '—'}
                        </td>
                        <td>{unitCost != null ? pesos(unitCost) : '—'}</td>
                      </>
                    ) : null}
                    <td className="expense-table-total">{pesos(expense.monto)}</td>
                    <td>{formatShortDay(expense.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function conceptPlaceholder(category: ExpenseCategory) {
  if (category === 'retiro-dinero') return 'Ej. Retiro personal';
  if (category === 'materia-prima') return 'Ej. Café molido';
  if (category === 'empaques') return 'Ej. Vasos 12 oz';
  if (category === 'pago-empleados') return 'Ej. Quincena barista';
  if (category === 'arriendo') return 'Ej. Arriendo octubre';
  return 'Ej. Factura de luz';
}

const SUGGESTED_FREQUENTS: Partial<Record<ExpenseCategory, FrequentConcept[]>> = {
  'retiro-dinero': [
    { concepto: 'Retiro personal', costo: 50000 },
    { concepto: 'Anticipo', costo: 100000 },
    { concepto: 'Efectivo sacado', costo: 30000 },
  ],
  'materia-prima': [
    { concepto: 'Café molido', costo: 17500 },
    { concepto: 'Azúcar', costo: 3200 },
    { concepto: 'Chocolate en polvo', costo: 14000 },
  ],
  empaques: [
    { concepto: 'Vasos 12 oz', costo: 180 },
    { concepto: 'Servilletas', costo: 90 },
    { concepto: 'Tapas', costo: 120 },
  ],
  'pago-empleados': [
    { concepto: 'Quincena barista', costo: 600000 },
    { concepto: 'Quincena cajero', costo: 550000 },
  ],
  arriendo: [{ concepto: 'Arriendo local', costo: 1500000 }],
  servicios: [
    { concepto: 'Energía', costo: 180000 },
    { concepto: 'Agua', costo: 90000 },
    { concepto: 'Internet', costo: 80000 },
  ],
};

function buildFrequents(
  history: ExpenseRow[],
  category: ExpenseCategory,
  usesQuantity: boolean,
): FrequentConcept[] {
  const ranked = new Map<string, FrequentConcept & { count: number; latest: number }>();

  for (const expense of history) {
    const key = expense.concepto.trim().toLowerCase();
    if (!key) continue;
    const parsed = parseExpenseNota(expense.nota);
    const costo = usesQuantity
      ? parsed?.unitCost ?? (parsed?.cantidad ? Math.round(expense.monto / parsed.cantidad) : expense.monto)
      : expense.monto;
    const current = ranked.get(key);
    const created = new Date(expense.createdAt).getTime();
    if (!current) {
      ranked.set(key, {
        concepto: expense.concepto.trim(),
        costo,
        cantidad: parsed?.cantidad,
        count: 1,
        latest: created,
      });
      continue;
    }
    current.count += 1;
    if (created >= current.latest) {
      current.concepto = expense.concepto.trim();
      current.costo = costo;
      current.cantidad = parsed?.cantidad;
      current.latest = created;
    }
  }

  const fromHistory = [...ranked.values()]
    .sort((a, b) => b.count - a.count || b.latest - a.latest)
    .slice(0, 5)
    .map(({ concepto, costo, cantidad }) => ({ concepto, costo, cantidad }));

  if (fromHistory.length > 0) return fromHistory;
  return SUGGESTED_FREQUENTS[category] ?? [];
}

function parseExpenseNota(nota?: string) {
  if (!nota) return null;
  const match = nota.match(/^([\d.]+)\s+\S+\s+·\s+\$?\s*([\d.\s]+)/);
  if (!match) return null;
  const cantidad = Number(match[1]);
  const unitCost = Number(match[2].replace(/\D/g, ''));
  if (!Number.isFinite(cantidad) || !Number.isFinite(unitCost)) return null;
  return { cantidad, unitCost };
}

export function expenseCategoryLabel(id: string) {
  return [PRODUCT_PURCHASE_TYPE, ...EXPENSE_TYPES].find((item) => item.id === id)?.label ?? id;
}

function formatComposerDate(value: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function formatShortDay(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function pesos(value: number) {
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return `$${formatted}`;
}

function readError(caught: unknown) {
  if (!axios.isAxiosError(caught)) return 'No se pudo registrar el gasto';
  const message = caught.response?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string') return message;
  return 'No se pudo registrar el gasto';
}

function ExpenseIcon({ name }: { name: Filter | string }) {
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
  if (name === 'retiro-dinero') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="7" y="11" width="18" height="12" rx="2.5" />
        <circle cx="16" cy="17" r="2.5" />
        <path d="M10 15.5V14a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.5" />
      </svg>
    );
  }
  if (name === 'materia-prima') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M10 12h12v8.5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V12z" />
        <path d="M22 14.5h1.8a2.2 2.2 0 0 1 0 4.4H22" />
      </svg>
    );
  }
  if (name === 'pago-empleados') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="11" r="3.5" />
        <path d="M8.5 24c1.6-4 4.2-6 7.5-6s5.9 2 7.5 6" />
      </svg>
    );
  }
  if (name === 'empaques') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8 12h16v12H8z" />
        <path d="M8 12l8-4 8 4" />
        <path d="M16 8v16" />
      </svg>
    );
  }
  if (name === 'arriendo') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 14l10-7 10 7v11H6V14z" />
        <path d="M13 25v-7h6v7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M10 22V12l6-4 6 4v10" />
      <path d="M10 18h12" />
    </svg>
  );
}
