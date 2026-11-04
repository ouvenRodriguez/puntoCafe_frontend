import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import homeHeroBg from '../assets/home-hero-bg.jpg';
import { expiryTone, formatExpiry, showsExpiry } from './ProductsPage';

interface SaleItem {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

interface SaleRow {
  total: number;
  metodoPago: 'efectivo' | 'transferencia';
  items: SaleItem[];
  createdAt: string;
}

interface ExpenseRow {
  monto: number;
  categoria: string;
  concepto: string;
  createdAt: string;
}

interface ProductRow {
  id: string;
  nombre: string;
  categoria?: string;
  costo: number;
  precioVenta: number;
  stock: number;
  stockMinimo: number;
  fechaVencimiento?: string;
}

const ACTIONS = [
  {
    to: '/ventas',
    label: 'Venta',
    text: 'Cobrar en caja',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 7.5h11l-.8 8.2a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8L6.5 7.5z" />
        <path d="M9 7.5V6.2A3 3 0 0 1 12 3.2 3 3 0 0 1 15 6.2v1.3" />
      </svg>
    ),
  },
  {
    to: '/productos',
    label: 'Producto',
    text: 'Stock y precios',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 8.5h8.2v6.2a4 4 0 0 1-8.2 0V8.5z" />
        <path d="M16.2 10h1.6a2 2 0 0 1 0 4h-1.6" />
        <path d="M10.2 5.5c.4.8.4 1.4 0 2.2M13.2 5c.4.8.4 1.4 0 2.2" />
      </svg>
    ),
  },
  {
    to: '/gastos',
    label: 'Gasto',
    text: 'Registrar costos',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
        <path d="M3.5 10.5h17" />
      </svg>
    ),
  },
  {
    to: '/historial',
    label: 'Historial',
    text: 'Movimientos',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 8.5V12l2.5 1.8" />
      </svg>
    ),
  },
] as const;

const EXPENSE_LABELS: Record<string, string> = {
  'retiro-dinero': 'Retiro de dinero',
  'materia-prima': 'Materia prima',
  empaques: 'Empaques',
  'pago-empleados': 'Empleados',
  arriendo: 'Arriendo',
  servicios: 'Servicios',
  'compra-productos': 'Compra productos',
};

const CHART_COLORS = {
  venta: '#1f1b18',
  gasto: '#c4672f',
  bar: '#6d5346',
  profit: '#2f7d4a',
  warn: '#c4672f',
  grid: '#ece6df',
  ink: '#1f1b18',
  muted: '#8d847b',
  future: '#f3ebe3',
};

const RESTOCK_COLORS = ['#6d5346', '#c4672f', '#8b6b5c', '#a67c52', '#4a342b', '#d4925c', '#9a7464'];
const EXPIRY_COLORS = ['#c4473a', '#c4672f', '#d9852b', '#a67c52', '#8b6b5c', '#6d5346'];

type TimelineMode = 'hoy' | '7dias' | 'mes' | 'ano';

interface TimelinePoint {
  label: string;
  hour?: number;
  ventas: number;
  gastos: number;
  isFuture?: boolean;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('hoy');
  const [timelineDate, setTimelineDate] = useState(() => toDateInputValue(new Date()));
  const [nowTick, setNowTick] = useState(() => new Date());
  const summaryScrollRef = useRef<HTMLDivElement>(null);
  const displayName = (user?.nombre ?? 'equipo').trim();

  function onTimelineDateChange(value: string) {
    if (!value) return;
    setTimelineDate(value);
    setTimelineMode('hoy');
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<SaleRow[]>('/ventas'),
      api.get<ExpenseRow[]>('/gastos'),
      api.get<ProductRow[]>('/productos'),
    ])
      .then(([salesResponse, expensesResponse, productsResponse]) => {
        setSales(salesResponse.data);
        setExpenses(expensesResponse.data);
        setProducts(productsResponse.data);
      })
      .catch(() => {
        setSales([]);
        setExpenses([]);
        setProducts([]);
      });
  }, []);

  const productCost = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) map.set(product.id, product.costo);
    return map;
  }, [products]);

  const today = useMemo(() => {
    const start = startOfToday();
    const salesToday = sales.filter((item) => new Date(item.createdAt) >= start);
    const expensesToday = expenses.filter((item) => new Date(item.createdAt) >= start);
    const sold = salesToday.reduce((sum, item) => sum + item.total, 0);
    const spent = expensesToday.reduce((sum, item) => sum + item.monto, 0);
    const cash = salesToday
      .filter((item) => item.metodoPago === 'efectivo')
      .reduce((sum, item) => sum + item.total, 0);
    const transfer = salesToday
      .filter((item) => item.metodoPago === 'transferencia')
      .reduce((sum, item) => sum + item.total, 0);
    const lowStock = products.filter((item) => item.stock <= item.stockMinimo).length;

    return {
      sold,
      spent,
      net: sold - spent,
      tickets: salesToday.length,
      cash,
      transfer,
      lowStock,
      products: products.length,
      dateLabel: formatTodayLabel(),
    };
  }, [sales, expenses, products]);

  const periodRange = useMemo(
    () => getPeriodRange(timelineMode, timelineDate),
    [timelineMode, timelineDate],
  );

  const periodSales = useMemo(
    () => sales.filter((item) => isInRange(item.createdAt, periodRange)),
    [sales, periodRange],
  );

  const periodExpenses = useMemo(
    () => expenses.filter((item) => isInRange(item.createdAt, periodRange)),
    [expenses, periodRange],
  );

  // La gráfica solo se recalcula con datos/filtros nuevos, no con el reloj.
  const timeline = useMemo(
    () => buildTimeline(sales, expenses, timelineMode, timelineDate, new Date()),
    [sales, expenses, timelineMode, timelineDate],
  );

  const timelineStats = useMemo(() => {
    const liveRows = timeline.filter((row) => !row.isFuture);
    const tip = liveRows[liveRows.length - 1];
    const ventas = tip?.ventas ?? 0;
    const gastos = tip?.gastos ?? 0;
    return { ventas, gastos, balance: ventas - gastos };
  }, [timeline]);

  const isLivePeriod = useMemo(() => {
    const anchor = parseDateInput(timelineDate) ?? startOfToday();
    if (timelineMode === 'hoy' || timelineMode === '7dias') {
      return isSameDay(anchor, nowTick);
    }
    if (timelineMode === 'ano') {
      return anchor.getFullYear() === nowTick.getFullYear();
    }
    return (
      anchor.getFullYear() === nowTick.getFullYear() &&
      anchor.getMonth() === nowTick.getMonth()
    );
  }, [timelineMode, timelineDate, nowTick]);

  const liveHourLabel = useMemo(() => {
    if (!isLivePeriod) return null;
    const liveRow = [...timeline].reverse().find((row) => !row.isFuture);
    return liveRow?.label ?? null;
  }, [isLivePeriod, timeline]);

  const livePoint = useMemo(() => {
    if (!liveHourLabel) return null;
    return timeline.find((row) => row.label === liveHourLabel) ?? null;
  }, [timeline, liveHourLabel]);

  const futureStartLabel = useMemo(() => {
    if (!isLivePeriod || !liveHourLabel) return null;
    const idx = timeline.findIndex((row) => row.label === liveHourLabel);
    if (idx < 0 || idx >= timeline.length - 1) return null;
    return timeline[idx].label;
  }, [isLivePeriod, liveHourLabel, timeline]);

  const summaryChartMinWidth = useMemo(() => {
    // ~8-10 puntos caben en pantalla; al haber más, aparece scroll horizontal.
    const pointWidth =
      timelineMode === 'hoy' ? 88 : timelineMode === 'mes' ? 48 : timelineMode === 'ano' ? 72 : 96;
    return timeline.length * pointWidth + 80;
  }, [timeline.length, timelineMode]);

  const summaryYDomain = useMemo(() => {
    let peak = 0;
    for (const row of timeline) {
      peak = Math.max(peak, row.ventas, row.gastos);
    }
    return [0, Math.max(peak * 1.08, 1)] as [number, number];
  }, [timeline]);

  const activityStamp = useMemo(() => {
    let latest = '';
    for (const item of sales) {
      if (item.createdAt > latest) latest = item.createdAt;
    }
    for (const item of expenses) {
      if (item.createdAt > latest) latest = item.createdAt;
    }
    return latest;
  }, [sales, expenses]);

  useEffect(() => {
    const node = summaryScrollRef.current;
    if (!node) return;

    // Solo se pega al en vivo cuando hay movimiento nuevo o cambia el filtro.
    const stickToLiveEnd = () => {
      node.scrollLeft = node.scrollWidth;
    };

    stickToLiveEnd();
    const frame = window.requestAnimationFrame(stickToLiveEnd);
    const timer = window.setTimeout(stickToLiveEnd, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [summaryChartMinWidth, timelineMode, timelineDate, activityStamp, timeline.length]);

  const topSold = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const sale of periodSales) {
      for (const item of sale.items ?? []) {
        const current = map.get(item.productoId) ?? {
          name: item.nombre,
          qty: 0,
          revenue: 0,
        };
        current.qty += item.cantidad;
        current.revenue += item.subtotal;
        current.name = item.nombre;
        map.set(item.productoId, current);
      }
    }
    return [...map.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 7)
      .map((item) => ({
        name: shortName(item.name),
        fullName: item.name,
        unidades: item.qty,
        ventas: item.revenue,
      }));
  }, [periodSales]);

  const topProfit = useMemo(() => {
    const map = new Map<string, { name: string; profit: number; qty: number }>();
    for (const sale of periodSales) {
      for (const item of sale.items ?? []) {
        const cost = productCost.get(item.productoId) ?? 0;
        const gain = (item.precioUnitario - cost) * item.cantidad;
        const current = map.get(item.productoId) ?? { name: item.nombre, profit: 0, qty: 0 };
        current.profit += gain;
        current.qty += item.cantidad;
        current.name = item.nombre;
        map.set(item.productoId, current);
      }
    }
    return [...map.values()]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 7)
      .map((item) => ({
        name: shortName(item.name),
        fullName: item.name,
        ganancia: Math.round(item.profit),
      }));
  }, [periodSales, productCost]);

  const topExpenses = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of periodExpenses) {
      if (expense.categoria === 'compra-productos') continue;
      map.set(expense.categoria, (map.get(expense.categoria) ?? 0) + expense.monto);
    }
    return [...map.entries()]
      .map(([id, total]) => ({
        name: EXPENSE_LABELS[id] ?? id,
        total: Math.round(total),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [periodExpenses]);

  const lowStockProducts = useMemo(() => {
    return products
      .filter((item) => item.stock <= item.stockMinimo)
      .map((item) => ({
        name: shortName(item.nombre),
        fullName: item.nombre,
        stock: item.stock,
        minimo: item.stockMinimo,
        faltante: Math.max(item.stockMinimo - item.stock, 1),
      }))
      .sort((a, b) => b.faltante - a.faltante || a.fullName.localeCompare(b.fullName, 'es'))
      .slice(0, 6);
  }, [products]);

  const expiryProducts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return products
      .flatMap((item) => {
        if (!showsExpiry(item.categoria ?? '') || !item.fechaVencimiento) return [];
        const tone = expiryTone(item.fechaVencimiento);
        if (tone !== 'is-expired' && tone !== 'is-soon') return [];
        const [year, month, day] = item.fechaVencimiento.split('-').map(Number);
        const expiry = new Date(year, month - 1, day);
        const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
        const peso = tone === 'is-expired' ? Math.max(3, 1 - diffDays) : Math.max(1, 8 - diffDays);
        return [
          {
            name: shortName(item.nombre),
            fullName: item.nombre,
            stock: item.stock,
            fecha: formatExpiry(item.fechaVencimiento),
            estado: tone === 'is-expired' ? 'Vencido' : diffDays === 0 ? 'Vence hoy' : `En ${diffDays} días`,
            tone,
            peso,
          },
        ];
      })
      .sort((a, b) => {
        if (a.tone !== b.tone) return a.tone === 'is-expired' ? -1 : 1;
        return b.peso - a.peso || a.fullName.localeCompare(b.fullName, 'es');
      })
      .slice(0, 6);
  }, [products]);

  return (
    <section className="home">
      <div className="home-screen">
        <div className="home-hero">
          <div className="home-hero-media" aria-hidden="true">
            <img src={homeHeroBg} alt="" />
          </div>

          <div className="home-hero-copy">
            <p className="home-hero-date">
              <span className="home-hero-date-dot" aria-hidden="true" />
              {formatHeroDate()}
            </p>
            <h1>
              Hola, <span className="home-hero-name">{displayName}</span>
            </h1>
            <p className="home-lead">
              <span className="home-lead-welcome">Bienvenido a Punto Café</span>
              <br />
              Aquí puedes registrar ventas y administrar las operaciones de tu cafetería.
            </p>
            <div className="home-cta">
              <Link className="button home-cta-primary" to="/ventas">
                Ir a vender
              </Link>
              <Link className="button home-cta-secondary" to="/historial">
                Ver historial
              </Link>
            </div>
          </div>

          <div className="home-hero-metrics">
            <article>
              <span>Vendido hoy</span>
              <strong>{pesos(today.sold)}</strong>
            </article>
            <article>
              <span>Gastos hoy</span>
              <strong>{pesos(today.spent)}</strong>
            </article>
            <article>
              <span>Balance</span>
              <strong className={today.net < 0 ? 'is-negative' : 'is-positive'}>
                {pesos(today.net)}
              </strong>
            </article>
          </div>
        </div>

        <div className="home-pulse">
          <div className="home-pulse-head">
            <div>
              <h2>Resumen de hoy</h2>
              <p className="home-pulse-sub">{today.dateLabel}</p>
            </div>
            <Link className="linkish" to="/historial">
              Ver detalle
            </Link>
          </div>
          <div className="home-pulse-grid is-wide">
            <article className="home-pulse-item">
              <span>Tickets</span>
              <strong>{today.tickets}</strong>
              <em>Ventas del día</em>
            </article>
            <article className="home-pulse-item">
              <span>Efectivo</span>
              <strong>{pesos(today.cash)}</strong>
              <em>Cobrado en caja</em>
            </article>
            <article className="home-pulse-item">
              <span>Transferencia</span>
              <strong>{pesos(today.transfer)}</strong>
              <em>Pagos digitales</em>
            </article>
            <article className={`home-pulse-item${today.lowStock > 0 ? ' is-warn' : ''}`}>
              <span>Stock bajo</span>
              <strong>{today.lowStock}</strong>
              <em>
                de {today.products} producto{today.products === 1 ? '' : 's'}
              </em>
            </article>
          </div>
        </div>

        <div className="home-actions" aria-label="Accesos rápidos">
          {ACTIONS.map((action) => (
            <Link key={action.to} to={action.to} className="home-action">
              <span className="home-action-icon">{action.icon}</span>
              <span className="home-action-copy">
                <strong>{action.label}</strong>
                <em>{action.text}</em>
              </span>
              <span className="home-action-go" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>

        <a className="home-scroll-hint" href="#analitica">
          Ver más
          <span aria-hidden="true">↓</span>
        </a>
      </div>

      <div className="home-analytics" id="analitica">
        <div className="home-analytics-head">
          <div className="home-analytics-copy">
            <h2>Resumen del negocio</h2>
            <p>Consulta tus ventas, gastos y productos para conocer cómo va tu cafetería.</p>
          </div>

          <div className="home-chart-tools" role="group" aria-label="Periodo de analítica">
            <div className="history-segment" role="tablist" aria-label="Vista">
              {(
                [
                  ['hoy', 'Hoy'],
                  ['7dias', '7 días'],
                  ['mes', 'Mes'],
                  ['ano', 'Año'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={
                    timelineMode === id ? 'history-segment-btn is-active' : 'history-segment-btn'
                  }
                  type="button"
                  role="tab"
                  aria-selected={timelineMode === id}
                  onClick={() => setTimelineMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="history-date-field">
              <span className="sr-only">Fecha</span>
              <input
                className="history-date"
                type="date"
                value={timelineDate}
                max={toDateInputValue(new Date())}
                aria-label="Elegir día"
                onChange={(event) => onTimelineDateChange(event.target.value)}
              />
            </label>
          </div>
        </div>

        <article className="home-chart-card home-chart-wide home-summary-chart">
          <div className="home-summary-top">
            <h3>Resumen de ventas y gastos</h3>
            {isLivePeriod ? (
              <span className="home-live-badge">
                <span className="home-live-dot" aria-hidden="true" />
                En vivo · {formatClock(nowTick)}
              </span>
            ) : (
              <span className="home-live-badge is-muted">{formatPickedDay(timelineDate)}</span>
            )}
          </div>

          <div className="home-summary-kpis">
            <article>
              <span>
                <BagIcon />
                Vendido
              </span>
              <strong>{compactPesos(timelineStats.ventas)}</strong>
            </article>
            <article>
              <span>
                <CardIcon />
                Gastos
              </span>
              <strong className="is-gasto">{compactPesos(timelineStats.gastos)}</strong>
            </article>
            <article>
              <span>
                <TrendIcon />
                Balance
              </span>
              <strong className={timelineStats.balance < 0 ? 'is-negative' : 'is-positive'}>
                {timelineStats.balance > 0 ? '+' : ''}
                {compactPesos(timelineStats.balance)}
              </strong>
            </article>
          </div>

          <div className="home-chart-body">
            {timeline.every((row) => row.ventas === 0 && row.gastos === 0) ? (
              <p className="muted-line">Aún no hay movimientos para graficar.</p>
            ) : (
              <div className="home-summary-frame">
                <div className="home-summary-yaxis" aria-hidden="true">
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={timeline} margin={{ top: 28, right: 0, left: 0, bottom: 0 }}>
                      <YAxis
                        domain={summaryYDomain}
                        tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value: number) => compactPesos(value)}
                        width={56}
                      />
                      <Area dataKey="ventas" stroke="none" fill="none" isAnimationActive={false} />
                      <Line dataKey="gastos" stroke="none" dot={false} isAnimationActive={false} />
                      <XAxis dataKey="label" hide />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="home-summary-scroll" ref={summaryScrollRef}>
                  <div
                    className="home-summary-scroll-inner"
                    style={{ minWidth: `max(100%, ${summaryChartMinWidth}px)` }}
                  >
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={timeline} margin={{ top: 28, right: 24, left: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="ventaFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_COLORS.venta} stopOpacity={0.16} />
                            <stop offset="100%" stopColor={CHART_COLORS.venta} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          interval={timelineMode === 'hoy' ? 1 : 'preserveStartEnd'}
                          minTickGap={28}
                        />
                        <YAxis domain={summaryYDomain} hide width={0} />
                        <Tooltip content={<MoneyTooltip />} />
                        {futureStartLabel ? (
                          <ReferenceArea
                            x1={futureStartLabel}
                            x2={timeline[timeline.length - 1]?.label}
                            fill={CHART_COLORS.future}
                            fillOpacity={0.9}
                            strokeOpacity={0}
                          />
                        ) : null}
                        <Area
                          type="monotone"
                          dataKey="ventas"
                          name="Ventas"
                          stroke={CHART_COLORS.venta}
                          fill="url(#ventaFill)"
                          strokeWidth={2.6}
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                        <Line
                          type={timelineMode === 'hoy' ? 'stepAfter' : 'monotone'}
                          dataKey="gastos"
                          name="Gastos"
                          stroke={CHART_COLORS.gasto}
                          strokeWidth={2.4}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                        {liveHourLabel && livePoint ? (
                          <ReferenceLine
                            x={liveHourLabel}
                            stroke="#c4b2a4"
                            strokeDasharray="5 5"
                            label={
                              <LivePointLabel
                                ventas={livePoint.ventas}
                                gastos={livePoint.gastos}
                              />
                            }
                          />
                        ) : null}
                        {timelineMode === 'mes' || timelineMode === 'ano' ? <Legend /> : null}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        </article>

        <div className="home-chart-grid">
          <article className="home-chart-card">
            <div className="home-chart-head">
              <h3>Productos más rentables</h3>
              <p>Margen estimado</p>
            </div>
            <div className="home-chart-body">
              {topProfit.length === 0 ? (
                <p className="muted-line">Todavía no hay ganancia para mostrar.</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={topProfit}
                    layout="vertical"
                    margin={{ top: 4, right: 56, left: 4, bottom: 0 }}
                    barCategoryGap="22%"
                  >
                    <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={96}
                      tick={{ fill: CHART_COLORS.ink, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<MoneyBarTooltip valueKey="ganancia" />} />
                    <Bar
                      dataKey="ganancia"
                      name="Ganancia"
                      fill={CHART_COLORS.profit}
                      radius={[0, 10, 10, 0]}
                      barSize={22}
                    >
                      <LabelList
                        dataKey="ganancia"
                        position="right"
                        formatter={(value) => compactPesos(Number(value ?? 0))}
                        className="home-bar-label"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="home-chart-card">
            <div className="home-chart-head">
              <h3>Productos más vendidos</h3>
              <p>Por unidades</p>
            </div>
            <div className="home-chart-body">
              {topSold.length === 0 ? (
                <p className="muted-line">Todavía no hay ventas.</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={topSold}
                    layout="vertical"
                    margin={{ top: 4, right: 48, left: 4, bottom: 0 }}
                    barCategoryGap="22%"
                  >
                    <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={96}
                      tick={{ fill: CHART_COLORS.ink, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<UnitsTooltip />} />
                    <Bar
                      dataKey="unidades"
                      name="Unidades"
                      fill={CHART_COLORS.bar}
                      radius={[0, 10, 10, 0]}
                      barSize={22}
                    >
                      <LabelList
                        dataKey="unidades"
                        position="right"
                        formatter={(value) => String(value ?? 0)}
                        className="home-bar-label"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="home-chart-card">
            <div className="home-chart-head">
              <h3>Distribución de gastos</h3>
              <p>Por tipo de gasto</p>
            </div>
            <div className="home-chart-body">
              {topExpenses.length === 0 ? (
                <p className="muted-line">Todavía no hay gastos registrados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={topExpenses}
                    margin={{ top: 28, right: 8, left: 0, bottom: 4 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value: number) => compactPesos(value)}
                      width={52}
                    />
                    <Tooltip content={<MoneyBarTooltip valueKey="total" />} />
                    <Bar
                      dataKey="total"
                      name="Gasto"
                      fill={CHART_COLORS.gasto}
                      radius={[10, 10, 0, 0]}
                      barSize={40}
                    >
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(value) => compactPesos(Number(value ?? 0))}
                        className="home-bar-label"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <article className="home-chart-card home-donut-split">
            <div className="home-donut-panel">
              <div className="home-chart-head">
                <h3>Productos por reponer</h3>
                <p>Faltante al mínimo</p>
              </div>
              <div className="home-chart-body home-restock-body">
                {lowStockProducts.length === 0 ? (
                  <p className="muted-line">Ningún producto está bajo el mínimo.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={lowStockProducts}
                          dataKey="faltante"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={74}
                          paddingAngle={3}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {lowStockProducts.map((row, index) => (
                            <Cell
                              key={row.fullName}
                              fill={RESTOCK_COLORS[index % RESTOCK_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<RestockTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="home-restock-legend">
                      {lowStockProducts.map((row, index) => (
                        <li key={row.fullName}>
                          <span
                            className="home-restock-swatch"
                            style={{ background: RESTOCK_COLORS[index % RESTOCK_COLORS.length] }}
                          />
                          <em>{row.fullName}</em>
                          <strong>-{row.faltante}</strong>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="home-donut-panel">
              <div className="home-chart-head">
                <h3>Productos por vencer</h3>
                <p>Vencidos o próximos</p>
              </div>
              <div className="home-chart-body home-restock-body">
                {expiryProducts.length === 0 ? (
                  <p className="muted-line">Ningún producto vencido o por vencer.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={expiryProducts}
                          dataKey="peso"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={74}
                          paddingAngle={3}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {expiryProducts.map((row, index) => (
                            <Cell
                              key={row.fullName}
                              fill={
                                row.tone === 'is-expired'
                                  ? EXPIRY_COLORS[0]
                                  : EXPIRY_COLORS[1 + (index % (EXPIRY_COLORS.length - 1))]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<ExpiryTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="home-restock-legend">
                      {expiryProducts.map((row, index) => (
                        <li key={row.fullName}>
                          <span
                            className="home-restock-swatch"
                            style={{
                              background:
                                row.tone === 'is-expired'
                                  ? EXPIRY_COLORS[0]
                                  : EXPIRY_COLORS[1 + (index % (EXPIRY_COLORS.length - 1))],
                            }}
                          />
                          <em>{row.fullName}</em>
                          <strong className={row.tone === 'is-expired' ? 'is-expired' : 'is-soon'}>
                            {row.estado}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
      </article>
        </div>
      </div>
    </section>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="home-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <p key={entry.name}>
          <span style={{ color: entry.color }}>{entry.name}</span>
          <em>{pesos(entry.value ?? 0)}</em>
        </p>
      ))}
    </div>
  );
}

function UnitsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { fullName?: string; unidades?: number } }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="home-tooltip">
      <strong>{row.fullName}</strong>
      <p>
        <span>Unidades</span>
        <em>{row.unidades}</em>
      </p>
    </div>
  );
}

function RestockTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: { fullName?: string; stock?: number; minimo?: number; faltante?: number };
  }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="home-tooltip">
      <strong>{row.fullName}</strong>
      <p>
        <span>Stock</span>
        <em>{row.stock}</em>
      </p>
      <p>
        <span>Mínimo</span>
        <em>{row.minimo}</em>
      </p>
      <p>
        <span>Faltante</span>
        <em>{row.faltante}</em>
      </p>
    </div>
  );
}

function ExpiryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: { fullName?: string; stock?: number; fecha?: string; estado?: string };
  }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="home-tooltip">
      <strong>{row.fullName}</strong>
      <p>
        <span>Estado</span>
        <em>{row.estado}</em>
      </p>
      <p>
        <span>Vence</span>
        <em>{row.fecha}</em>
      </p>
      <p>
        <span>Stock</span>
        <em>{row.stock}</em>
      </p>
    </div>
  );
}

function MoneyBarTooltip({
  active,
  payload,
  valueKey,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, string | number | undefined> }>;
  valueKey: string;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  const label = String(row.fullName ?? row.name ?? '');
  const value = Number(row[valueKey] ?? 0);
  return (
    <div className="home-tooltip">
      <strong>{label}</strong>
      <p>
        <span>{valueKey === 'ganancia' ? 'Ganancia' : 'Total'}</span>
        <em>{pesos(value)}</em>
      </p>
    </div>
  );
}

function buildTimeline(
  sales: SaleRow[],
  expenses: ExpenseRow[],
  mode: TimelineMode,
  dateValue: string,
  now: Date,
): TimelinePoint[] {
  const anchor = parseDateInput(dateValue) ?? startOfToday();

  if (mode === 'hoy') {
    const dayStart = new Date(anchor);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const live = isSameDay(anchor, now);
    const startHour = 8;
    const businessEnd = 20;
    // El borde en vivo sigue la última venta/gasto, no el reloj.
    const lastAt = latestActivityAt(sales, expenses, dayStart, dayEnd);
    const edge = live ? (lastAt ?? now) : new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), businessEnd, 59);
    const currentHour = Math.min(businessEnd, Math.max(startHour, edge.getHours()));
    const currentMinute = live ? edge.getMinutes() : 59;
    // Lo en vivo ~3/4 del eje; lo que falta ~1/4 (nunca a la mitad).
    const livedHours = Math.max(1, currentHour - startHour + 1);
    const futureHours = live ? Math.max(1, Math.round(livedHours / 3)) : 0;
    const endHour = live ? Math.min(businessEnd, currentHour + futureHours) : businessEnd;
    const rows: TimelinePoint[] = [];
    let ventas = 0;
    let gastos = 0;

    for (let hour = startHour; hour <= endHour; hour += 1) {
      for (const minute of [0, 30]) {
        if (live && hour === endHour && minute > 0 && currentHour + futureHours <= businessEnd) {
          // Corta el último tramo futuro para no alargar de más la zona oscura.
          continue;
        }
        const slotStart = new Date(dayStart);
        slotStart.setHours(hour, minute, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + 30);
        const isFuture =
          live &&
          (hour > currentHour || (hour === currentHour && minute > currentMinute));
        if (!isFuture) {
          ventas += sumInRange(sales, slotStart, slotEnd, (item) => item.total);
          gastos += sumInRange(expenses, slotStart, slotEnd, (item) => item.monto);
        }
        rows.push({
          label: formatHourLabel(hour, minute),
          hour,
          ventas,
          gastos,
          isFuture,
        });
      }
    }
    return rows;
  }

  if (mode === 'ano') {
    const year = anchor.getFullYear();
    const live = year === now.getFullYear();
    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const yearEnd = new Date(year + 1, 0, 1, 0, 0, 0, 0);
    const lastAt = latestActivityAt(sales, expenses, yearStart, yearEnd);
    const edgeMonth = live ? (lastAt ?? now).getMonth() : 11;

    const rows: TimelinePoint[] = [];
    let ventas = 0;
    let gastos = 0;
    for (let month = 0; month <= 11; month += 1) {
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
      const isFuture = live && month > edgeMonth;
      if (!isFuture) {
        ventas += sumInRange(sales, start, end, (item) => item.total);
        gastos += sumInRange(expenses, start, end, (item) => item.monto);
      }
      rows.push({
        label: formatMonthLabel(month),
        ventas,
        gastos,
        isFuture,
      });
    }
    return rows;
  }

  if (mode === 'mes') {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const live = year === now.getFullYear() && month === now.getMonth();
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 1, 0, 0, 0, 0);
    const lastAt = latestActivityAt(sales, expenses, monthStart, monthEnd);
    const edgeDate = live ? startOfDay(lastAt ?? now) : new Date(year, month, daysInMonth);
    const edgeDay = edgeDate.getDate();
    const livedDays = Math.max(1, edgeDay);
    const futureDays = live ? Math.max(1, Math.round(livedDays / 3)) : 0;
    // Pendiente a la derecha (puede pasar al mes siguiente, como en Hoy).
    const lastDate = live
      ? new Date(edgeDate.getFullYear(), edgeDate.getMonth(), edgeDate.getDate() + futureDays)
      : new Date(year, month, daysInMonth);

    const rows: TimelinePoint[] = [];
    let ventas = 0;
    let gastos = 0;
    for (
      let cursor = new Date(year, month, 1);
      cursor <= lastDate;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const start = new Date(cursor);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const isFuture = live && start > edgeDate;
      if (!isFuture) {
        ventas += sumInRange(sales, start, end, (item) => item.total);
        gastos += sumInRange(expenses, start, end, (item) => item.monto);
      }
      const sameMonth = start.getMonth() === month;
      rows.push({
        label: sameMonth
          ? String(start.getDate())
          : new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(start),
        ventas,
        gastos,
        isFuture,
      });
    }
    return rows;
  }

  // 7 días: acumulado; en vivo = último movimiento; días siguientes quedan pendientes.
  const end = new Date(anchor);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const rangeEnd = new Date(end);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  const live = isSameDay(anchor, now);
  const lastAt = latestActivityAt(sales, expenses, start, rangeEnd);
  const edge = live ? startOfDay(lastAt ?? now) : end;
  const edgeOffset = Math.max(
    0,
    Math.round((edge.getTime() - start.getTime()) / 86_400_000),
  );
  const livedDays = Math.max(1, edgeOffset + 1);
  // Igual que en Hoy: ~1/4 pendiente a la derecha (puede pasar del ancla).
  const futureDays = live ? Math.max(1, Math.round(livedDays / 3)) : 0;
  const lastOffset = live ? edgeOffset + futureDays : 6;

  const rows: TimelinePoint[] = [];
  let ventas = 0;
  let gastos = 0;
  for (let offset = 0; offset <= lastOffset; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const isFuture = live && offset > edgeOffset;
    if (!isFuture) {
      ventas += sumInRange(sales, day, next, (item) => item.total);
      gastos += sumInRange(expenses, day, next, (item) => item.monto);
    }
    rows.push({
      label: new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' }).format(day),
      ventas,
      gastos,
      isFuture,
    });
  }
  return rows;
}

function startOfDay(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

function formatMonthLabel(month: number) {
  return new Intl.DateTimeFormat('es-CO', { month: 'short' })
    .format(new Date(2026, month, 1))
    .replace(/\.$/, '');
}

function LivePointLabel({
  viewBox,
  ventas,
  gastos,
}: {
  viewBox?: { x?: number; y?: number };
  ventas: number;
  gastos: number;
}) {
  const x = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <foreignObject x={10} y={8} width={140} height={64}>
        <div className="home-live-labels">
          <span className="is-venta">Ventas {compactPesos(ventas)}</span>
          <span className="is-gasto">Gastos {compactPesos(gastos)}</span>
        </div>
      </foreignObject>
    </g>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 7.5h11l-.8 8.2a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8L6.5 7.5z" />
      <path d="M9 7.5V6.2A3 3 0 0 1 12 3.2 3 3 0 0 1 15 6.2v1.3" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
      <path d="M3.5 10.5h17" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16.5 10 10l4 4 6-7.5" />
      <path d="M15 6.5h5v5" />
    </svg>
  );
}

function latestActivityAt(
  sales: SaleRow[],
  expenses: ExpenseRow[],
  dayStart: Date,
  dayEnd: Date,
) {
  let latest: Date | null = null;
  for (const item of sales) {
    const at = new Date(item.createdAt);
    if (at >= dayStart && at < dayEnd && (!latest || at > latest)) latest = at;
  }
  for (const item of expenses) {
    const at = new Date(item.createdAt);
    if (at >= dayStart && at < dayEnd && (!latest || at > latest)) latest = at;
  }
  return latest;
}

function formatHourLabel(hour: number, minute = 0) {
  const suffix = hour === 12 ? 'm.' : hour < 12 ? 'a.m.' : 'p.m.';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (minute === 0) {
    if (hour === 12) return '12 m.';
    return `${display} ${suffix}`;
  }
  return `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatPickedDay(value: string) {
  const date = parseDateInput(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function sumInRange<T extends { createdAt: string }>(
  items: T[],
  start: Date,
  end: Date,
  valueOf: (item: T) => number,
) {
  return items
    .filter((item) => {
      const date = new Date(item.createdAt);
      return date >= start && date < end;
    })
    .reduce((sum, item) => sum + valueOf(item), 0);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getPeriodRange(mode: TimelineMode, dateValue: string) {
  const anchor = parseDateInput(dateValue) ?? startOfToday();

  if (mode === 'hoy') {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(anchor);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (mode === 'mes') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (mode === 'ano') {
    const start = new Date(anchor.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end };
  }

  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return { start, end };
}

function isInRange(value: string, range: { start: Date; end: Date }) {
  const date = new Date(value);
  return date >= range.start && date <= range.end;
}

function shortName(value: string) {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

function formatHeroDate() {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(new Date())
    .toUpperCase();
}

function pesos(value: number) {
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.abs(value));
  return `${value < 0 ? '-' : ''}$${formatted}`;
}

function compactPesos(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1000)}k`;
  return pesos(value);
}
