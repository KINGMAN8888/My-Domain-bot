import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Radar, LayoutDashboard, Bookmark, Settings, Bell, Search,
  ExternalLink, Star, TrendingUp, AlertCircle, CheckCircle2,
  RefreshCw, Wifi, WifiOff, Globe, Zap, Shield, Clock,
  ChevronUp, ChevronDown, X, Filter, Send, Hash, Activity,
  BarChart2, ArrowUpRight, Copy, Check, MessageSquare, Bot
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from './lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Domain {
  domain: string;
  score: number;
  date_added: string;
  tld?: string;
  name_len?: number;
  keywords: string[];
  isSaved?: boolean;
}

interface Stats {
  total: number;
  golden: number;
  today: number;
}

type SortKey = 'score' | 'date_added' | 'domain';
type SortDir = 'asc' | 'desc';
type Tab = 'dashboard' | 'saved' | 'settings';

// ─── API ──────────────────────────────────────────────────────────────────────
const API = 'http://localhost:8000';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(API + path, { signal: AbortSignal.timeout(5000), ...opts });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MOCK_DOMAINS: Domain[] = [
  { domain: 'payai.com',      score: 100, date_added: '2026-03-27T10:00:00Z', tld: '.com', name_len: 5,  keywords: ['pay', 'ai'] },
  { domain: 'xpay.ai',        score: 100, date_added: '2026-03-27T09:00:00Z', tld: '.ai',  name_len: 4,  keywords: ['pay'] },
  { domain: 'nexuscloud.com', score: 95,  date_added: '2026-03-26T18:00:00Z', tld: '.com', name_len: 10, keywords: ['nexus', 'cloud'] },
  { domain: 'cryptohub.io',   score: 85,  date_added: '2026-03-26T14:00:00Z', tld: '.io',  name_len: 9,  keywords: ['crypto', 'hub'] },
  { domain: 'buildfast.ai',   score: 85,  date_added: '2026-03-25T20:00:00Z', tld: '.ai',  name_len: 9,  keywords: [] },
  { domain: 'smartdata.net',  score: 75,  date_added: '2026-03-25T10:00:00Z', tld: '.net', name_len: 9,  keywords: ['data'] },
  { domain: 'tech-flow.com',  score: 45,  date_added: '2026-03-24T16:00:00Z', tld: '.com', name_len: 8,  keywords: ['tech'] },
  { domain: '0x-trade.io',    score: 45,  date_added: '2026-03-24T12:00:00Z', tld: '.io',  name_len: 7,  keywords: [] },
];
const MOCK_STATS: Stats = { total: 1240, golden: 5, today: 12 };

function scoreColor(s: number) {
  if (s >= 90) return { dot: 'bg-emerald-400', badge: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20', bar: 'bg-emerald-400' };
  if (s >= 80) return { dot: 'bg-blue-400',    badge: 'bg-blue-400/10    text-blue-400    border-blue-400/20',    bar: 'bg-blue-400' };
  if (s >= 60) return { dot: 'bg-amber-400',   badge: 'bg-amber-400/10   text-amber-400   border-amber-400/20',   bar: 'bg-amber-400' };
  return              { dot: 'bg-rose-400',    badge: 'bg-rose-400/10    text-rose-400    border-rose-400/20',    bar: 'bg-rose-400' };
}

function relativeTime(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return '—'; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number }) {
  const c = scoreColor(score);
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border tabular-nums', c.badge)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {score}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const c = scoreColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', c.bar)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-400 w-7 text-right">{score}</span>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, delta, loading }: {
  title: string; value: string | number; icon: any; delta?: string; loading?: boolean;
}) {
  return (
    <div className="relative overflow-hidden bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex flex-col gap-3 hover:border-slate-700 transition-colors group">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex justify-between items-start">
        <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/50">
          <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        {delta && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
            <ArrowUpRight className="w-3 h-3" />
            {delta}
          </span>
        )}
      </div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{title}</p>
        {loading
          ? <div className="h-8 w-20 bg-slate-800 rounded-lg animate-pulse" />
          : <p className="text-3xl font-bold text-slate-50 tabular-nums">{value}</p>
        }
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-700 rounded text-slate-400">{children}</kbd>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function Toast({ msg, type, onClose }: { key?: string | number; msg: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const colors = { success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', error: 'border-rose-500/30 bg-rose-500/10 text-rose-300', info: 'border-blue-500/30 bg-blue-500/10 text-blue-300' };
  const icons = { success: <CheckCircle2 className="w-4 h-4 shrink-0" />, error: <AlertCircle className="w-4 h-4 shrink-0" />, info: <Activity className="w-4 h-4 shrink-0" /> };
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl backdrop-blur-md animate-[slideIn_0.2s_ease]', colors[type])}>
      {icons[type]}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState<Tab>('dashboard');
  const [domains, setDomains]   = useState<Domain[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [scanning, setScanning] = useState(false);
  const [online, setOnline]     = useState<boolean | null>(null);
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('score');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [filterMin, setFilterMin] = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const [toasts, setToasts]     = useState<{ id: number; msg: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [notifications, setNotifications] = useState(0);
  const [botStatus, setBotStatus] = useState<{ connected: boolean; name?: string; username?: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const toastId = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastId.current;
    setToasts(p => [...p, { id, msg, type }]);
  }, []);

  const loadData = useCallback(async (q = '') => {
    setLoading(true);
    const path = q ? `/api/domains?search=${encodeURIComponent(q)}` : '/api/domains';
    const [d, s] = await Promise.all([apiFetch<Domain[]>(path), apiFetch<Stats>('/api/stats')]);
    if (d !== null && s !== null) {
      setOnline(true);
      setDomains(d.map(x => ({ ...x, tld: x.tld || ('.' + x.domain.split('.').slice(1).join('.')), name_len: x.name_len || x.domain.split('.')[0].length })));
      setStats(s);
    } else {
      setOnline(false);
      const f = q ? MOCK_DOMAINS.filter(x => x.domain.includes(q.toLowerCase()) || x.keywords.some(k => k.includes(q))) : MOCK_DOMAINS;
      setDomains(f);
      setStats(MOCK_STATS);
    }
    setLoading(false);
  }, []);

  useEffect(() => { const t = setTimeout(() => loadData(search), 300); return () => clearTimeout(t); }, [search, loadData]);
  useEffect(() => { loadData(); }, [loadData]);

  // Fetch bot status once on mount
  useEffect(() => {
    apiFetch<{ connected: boolean; name?: string; username?: string }>('/api/bot/status')
      .then(r => { if (r) setBotStatus(r); });
  }, []);

  const sendTestMessage = async () => {
    setSendingTest(true);
    const r = await apiFetch<{ success: boolean }>('/api/telegram/test', { method: 'POST' });
    if (r?.success) addToast('✅ Test message sent to Telegram!', 'success');
    else addToast('❌ Failed to send. Check bot token.', 'error');
    setSendingTest(false);
  };

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleScan = async () => {
    setScanning(true);
    addToast('Scanning for golden domains…', 'info');
    const result = await apiFetch<{ scanned: number; saved: number }>('/api/scan', { method: 'POST' });
    if (result) {
      await loadData(search);
      if (result.saved > 0) {
        setNotifications(p => p + result.saved);
        addToast(`✨ Found ${result.saved} new golden domain${result.saved > 1 ? 's' : ''}!`, 'success');
      } else {
        addToast(`Scanned ${result.scanned} domains — no new golden finds this time.`, 'info');
      }
    } else {
      addToast('Scan failed — backend may be offline.', 'error');
    }
    setScanning(false);
  };

  const toggleSave = (domain: string) => {
    setDomains(p => p.map(d => d.domain === domain ? { ...d, isSaved: !d.isSaved } : d));
    const d = domains.find(x => x.domain === domain);
    if (d) addToast(d.isSaved ? `Removed ${domain}` : `Saved ${domain}`, 'success');
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(p => p === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...domains]
    .filter(d => d.score >= filterMin)
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'score')      cmp = a.score - b.score;
      else if (sortKey === 'domain') cmp = a.domain.localeCompare(b.domain);
      else                           cmp = new Date(a.date_added).getTime() - new Date(b.date_added).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const saved = domains.filter(d => d.isSaved);

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
    : <span className="w-3 h-3 opacity-0 group-hover:opacity-40"><ChevronDown className="w-3 h-3" /></span>;

  const navItems: { id: Tab; icon: any; label: string; badge?: number }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'saved',     icon: Bookmark,        label: 'Saved',    badge: saved.length || undefined },
    { id: 'settings',  icon: Settings,        label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex font-sans antialiased selection:bg-emerald-500/30">

      {/* ── Toast Container ──────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-80">
        {toasts.map(t => (
          <Toast key={t.id} msg={t.msg} type={t.type} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
        ))}
      </div>

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-slate-800/60 bg-slate-950/80 backdrop-blur-xl flex flex-col fixed h-full z-10">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-800/60 gap-3 shrink-0">
          <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg shadow-emerald-500/20">
            <Radar className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight text-slate-50">DomainRadar</span>
            <span className="text-emerald-400 font-bold text-base">.ai</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold px-3 pb-2 pt-1">Main</p>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all',
                tab === item.id
                  ? 'bg-emerald-500/10 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
              {item.badge ? (
                <span className="ml-auto text-[10px] font-bold bg-emerald-500 text-slate-950 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}

          {/* Status */}
          <div className="pt-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold px-3 pb-2">Status</p>
            <div className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium border',
              online === true  ? 'bg-emerald-500/5  text-emerald-400 border-emerald-500/15' :
              online === false ? 'bg-amber-500/5    text-amber-400   border-amber-500/15'   :
                                 'bg-slate-800/50   text-slate-500   border-slate-700/50'
            )}>
              {online === true  ? <Wifi    className="w-3.5 h-3.5" /> :
               online === false ? <WifiOff className="w-3.5 h-3.5" /> :
                                  <Activity className="w-3.5 h-3.5 animate-pulse" />}
              {online === true ? 'API Connected' : online === false ? 'Demo Mode' : 'Connecting…'}
            </div>
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-800/60 shrink-0">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800/50">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-slate-950 font-bold text-xs shrink-0">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">Admin</p>
              <p className="text-xs text-slate-500 truncate">Pro Plan · Active</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main className="flex-1 ml-60 flex flex-col min-h-screen">

        {/* Topbar */}
        <header className="h-16 border-b border-slate-800/60 bg-[#080c14]/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-200 capitalize">{tab.replace('-', ' ')}</h1>
            {online === false && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">Demo</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative group">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search domains…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-slate-900/60 border border-slate-800/60 rounded-xl pl-9 pr-14 py-2 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all w-56 focus:w-72 text-slate-200 placeholder:text-slate-600"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
                <Kbd>⌘K</Kbd>
              </div>
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilter(p => !p)}
              className={cn('p-2 rounded-xl border text-sm transition-all', showFilter ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200')}
              title="Filter by score"
            >
              <Filter className="w-4 h-4" />
            </button>

            {/* Scan Now */}
            {online && (
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
              >
                {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {scanning ? 'Scanning…' : 'Scan Now'}
              </button>
            )}

            {/* Notification bell */}
            <button
              onClick={() => setNotifications(0)}
              className="relative p-2 text-slate-400 hover:text-slate-100 transition-colors rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-700"
            >
              <Bell className="w-4 h-4" />
              {notifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 text-slate-950 text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-[#080c14]">
                  {notifications}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Score filter panel */}
        {showFilter && (
          <div className="border-b border-slate-800/60 bg-slate-900/30 px-6 py-3 flex items-center gap-4 text-sm">
            <Filter className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-slate-400">Min Score:</span>
            <input type="range" min="0" max="100" step="5" value={filterMin} onChange={e => setFilterMin(+e.target.value)} className="accent-emerald-500 w-40" />
            <span className="text-emerald-400 font-bold w-8">{filterMin}</span>
            <div className="flex gap-2 ml-2">
              {[0, 60, 80, 90].map(v => (
                <button key={v} onClick={() => setFilterMin(v)} className={cn('px-2.5 py-0.5 rounded-lg text-xs font-medium border transition-all', filterMin === v ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-slate-500 border-slate-800 hover:border-slate-600 hover:text-slate-300')}>
                  {v === 0 ? 'All' : `≥${v}`}
                </button>
              ))}
            </div>
            <span className="ml-auto text-slate-600 text-xs">{sorted.length} result{sorted.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">

          {/* ══ DASHBOARD ══════════════════════════════════════ */}
          {tab === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-6">

              {/* Offline banner */}
              {online === false && (
                <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/15 rounded-2xl px-5 py-4 text-sm">
                  <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 font-semibold">Demo Mode — Backend offline</p>
                    <p className="text-amber-400/70 mt-0.5">
                      Run <code className="bg-amber-500/10 px-1.5 py-0.5 rounded text-xs">python backend.py both</code> in the project folder to connect the live backend.
                    </p>
                  </div>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard title="Total Scanned"           value={stats?.total.toLocaleString() ?? '0'} icon={Radar}     delta="+12%"  loading={loading} />
                <StatCard title="Golden Opportunities ≥80" value={stats?.golden ?? '0'}               icon={Star}      delta="+5%"   loading={loading} />
                <StatCard title="Discovered Today"         value={stats?.today  ?? '0'}               icon={Activity}               loading={loading} />
              </div>

              {/* Table */}
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-sm text-slate-100">Available Domains</span>
                    <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded-full ml-1">{sorted.length}</span>
                  </div>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-20 gap-3 text-slate-500 text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-[11px] uppercase tracking-wider text-slate-500">
                          {([
                            ['domain',     'Domain'],
                            ['score',      'Score'],
                            [null,         'TLD'],
                            [null,         'Length'],
                            [null,         'Keywords'],
                            ['date_added', 'Discovered'],
                            [null,         'Actions'],
                          ] as [SortKey | null, string][]).map(([key, label], i) => (
                            <th key={i} className={cn('px-5 py-3 font-semibold', i === 6 && 'text-right')}>
                              {key ? (
                                <button onClick={() => handleSort(key)} className="group flex items-center gap-1 hover:text-slate-300 transition-colors">
                                  {label} <SortIcon k={key} />
                                </button>
                              ) : label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.length === 0 ? (
                          <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-600">
                            <Globe className="w-8 h-8 mx-auto mb-3 opacity-30" />
                            <p>No domains found.</p>
                            {online && <p className="text-xs mt-1">Click <strong className="text-emerald-400">Scan Now</strong> to discover golden domains.</p>}
                          </td></tr>
                        ) : sorted.map(d => {
                          const tld = d.tld || ('.' + d.domain.split('.').slice(1).join('.'));
                          const len = d.name_len || d.domain.split('.')[0].length;
                          return (
                            <tr key={d.domain} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-semibold text-slate-200">{d.domain}</span>
                                  <CopyButton text={d.domain} />
                                </div>
                              </td>
                              <td className="px-5 py-3.5 w-36">
                                <ScoreBar score={d.score} />
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="text-xs font-mono bg-slate-800/80 text-slate-300 border border-slate-700/50 px-2 py-0.5 rounded">{tld}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="flex items-center gap-1 text-sm text-slate-400">
                                  <Hash className="w-3 h-3 text-slate-600" />{len}
                                </span>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex gap-1.5 flex-wrap">
                                  {d.keywords.length > 0 ? d.keywords.map(k => (
                                    <span key={k} className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-300 text-[11px] font-medium border border-blue-500/15">{k}</span>
                                  )) : <span className="text-slate-700 text-xs">—</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Clock className="w-3 h-3" />
                                  {relativeTime(d.date_added)}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => toggleSave(d.domain)}
                                    className={cn('p-1.5 rounded-lg border transition-all', d.isSaved ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-slate-500 border-slate-700/50 hover:text-slate-200 hover:bg-slate-800')}
                                    title={d.isSaved ? 'Unsave' : 'Save'}
                                  >
                                    <Bookmark className="w-3.5 h-3.5" fill={d.isSaved ? 'currentColor' : 'none'} />
                                  </button>
                                  <a
                                    href={`https://www.namecheap.com/domains/registration/results/?domain=${d.domain}`}
                                    target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-all shadow-sm shadow-emerald-500/20"
                                  >
                                    Buy <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ SAVED ══════════════════════════════════════════ */}
          {tab === 'saved' && (
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-100">Saved Domains</h2>
                <span className="text-xs text-slate-500">{saved.length} saved</span>
              </div>
              {saved.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-600 border border-dashed border-slate-800 rounded-2xl">
                  <Bookmark className="w-10 h-10 mb-4 opacity-30" />
                  <p className="font-medium">No saved domains yet</p>
                  <p className="text-sm mt-1 opacity-60">Hover over a domain in the dashboard and click the bookmark icon.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {saved.map(d => {
                    const c = scoreColor(d.score);
                    return (
                      <div key={d.domain} className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5 flex flex-col gap-4 hover:border-slate-700 transition-colors group">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-lg font-bold text-slate-100">{d.domain}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-xs font-mono bg-slate-800 text-slate-400 border border-slate-700/50 px-1.5 py-0.5 rounded">{d.tld}</span>
                              <span className="text-xs text-slate-600">·</span>
                              <span className="text-xs text-slate-500">{d.name_len} chars</span>
                            </div>
                          </div>
                          <ScorePill score={d.score} />
                        </div>

                        {/* Score bar */}
                        <div>
                          <div className="flex justify-between text-[10px] text-slate-600 mb-1"><span>Score</span><span>{d.score}/100</span></div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', c.bar)} style={{ width: `${d.score}%` }} />
                          </div>
                        </div>

                        {d.keywords.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {d.keywords.map(k => (
                              <span key={k} className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-300 text-[11px] border border-blue-500/15">{k}</span>
                            ))}
                          </div>
                        )}

                        <div className="mt-auto pt-3 flex items-center justify-between border-t border-slate-800/60">
                          <span className="text-xs text-slate-600">{relativeTime(d.date_added)}</span>
                          <div className="flex gap-2">
                            <button onClick={() => toggleSave(d.domain)} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg border border-slate-700/50 hover:border-rose-400/20 transition-all">
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <a href={`https://www.namecheap.com/domains/registration/results/?domain=${d.domain}`} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all">
                              Buy Now <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ SETTINGS ══════════════════════════════════════ */}
          {tab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-5">

              {/* Worker config */}
              <section className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-slate-800 rounded-lg"><BarChart2 className="w-4 h-4 text-emerald-400" /></div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-100">Worker Configuration</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Domain scanner & scoring rules</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Target TLDs</label>
                    <input defaultValue=".com, .ai, .io, .net" className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 text-slate-200 placeholder:text-slate-600 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Max Domain Length</label>
                    <input type="number" defaultValue="12" className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 text-slate-200 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Golden Keywords</label>
                    <textarea defaultValue="ai, tech, crypto, pay, app, hub, nexus, cloud, data, web" rows={3} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 text-slate-200 resize-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Minimum Alert Score: <span className="text-emerald-400">80</span></label>
                    <input type="range" min="50" max="100" defaultValue="80" className="w-full accent-emerald-500" />
                  </div>
                </div>
              </section>

              {/* Telegram Bot Status */}
              <section className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-slate-800 rounded-lg"><MessageSquare className="w-4 h-4 text-sky-400" /></div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-100">Telegram Bot</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Interactive bot with commands &amp; notifications</p>
                  </div>
                  {botStatus !== null && (
                    <span className={`ml-auto flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                      botStatus.connected
                        ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                        : 'text-rose-400 bg-rose-400/10 border-rose-400/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${botStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                      {botStatus.connected ? 'Connected' : 'Offline'}
                    </span>
                  )}
                </div>

                {/* Bot Info Card */}
                {botStatus?.connected && (
                  <div className="flex items-center gap-4 bg-sky-500/5 border border-sky-500/15 rounded-xl px-4 py-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center shrink-0">
                      <span className="text-white text-lg">🤖</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100">{botStatus.name || 'DomainRadar Bot'}</p>
                      <p className="text-xs text-sky-400 font-mono">@{botStatus.username}</p>
                    </div>
                    <a
                      href={`https://t.me/${botStatus.username}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg hover:bg-sky-500/20 transition-all"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Commands Preview */}
                <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-3">Available Commands</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { cmd: '/start', desc: 'Welcome & menu', emoji: '👋' },
                      { cmd: '/scan',  desc: 'Run scan now',   emoji: '🔍' },
                      { cmd: '/list',  desc: 'Last 10 domains', emoji: '📋' },
                      { cmd: '/top',   desc: 'Top 5 domains',  emoji: '🏆' },
                      { cmd: '/stats', desc: 'Statistics',     emoji: '📊' },
                      { cmd: '/help',  desc: 'Help menu',      emoji: '🆘' },
                    ].map(({ cmd, desc, emoji }) => (
                      <div key={cmd} className="flex items-center gap-2 text-xs">
                        <span className="text-base">{emoji}</span>
                        <div>
                          <span className="font-mono text-emerald-400">{cmd}</span>
                          <span className="text-slate-600 ml-1">— {desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Test Button */}
                <button
                  onClick={sendTestMessage}
                  disabled={sendingTest || !online}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingTest ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingTest ? 'Sending…' : 'Send Test Message'}
                </button>

                {!online && (
                  <p className="text-center text-xs text-slate-600 mt-2">Start backend to use Telegram features</p>
                )}
              </section>

              {/* API Status */}
              <section className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-slate-800 rounded-lg"><Globe className="w-4 h-4 text-purple-400" /></div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-100">API Connection</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Backend server status</p>
                  </div>
                </div>
                <div className="font-mono text-xs bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2 text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Endpoint</span>
                    <span className="text-slate-300">http://localhost:8000</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className={online ? 'text-emerald-400' : 'text-amber-400'}>{online ? '● Online' : '● Offline'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Mode</span>
                    <span>{online ? 'Live Data' : 'Demo Mode'}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-3 font-mono">
                  Run: <code className="text-emerald-400">python backend.py both</code>
                </p>
              </section>

              <div className="flex justify-end">
                <button
                  onClick={() => addToast('Configuration saved!', 'success')}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>
    </div>
  );
}
