import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wallet, Plus, X, Tag, TrendingUp, Menu, Clock, AlertCircle, 
  CheckCircle2, Timer, TrendingDown, ArrowDownCircle, Activity,
  RefreshCw, Filter, Search, Trash2
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

// --- CONFIGURACIÓN ---
const API_URL = 'https://cors-proxy.fringe.zone/https://api.hyperliquid.xyz/info';
const UNSTAKING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// --- UTILIDADES ---
const formatAddress = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const calculateTimeRemaining = (endTime) => {
  const remaining = endTime - Date.now();
  if (remaining <= 0) return null;
  
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remaining / 1000 / 60) % 60);
  return { days, hours, minutes, totalMs: remaining };
};

// --- COMPONENTE DE TARJETA DE WALLET ---
const WalletCard = ({ wallet, onRemove, onUpdateLabel }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [newLabel, setNewLabel] = useState(wallet.label);

  const fetchWalletData = useCallback(async () => {
    try {
      setLoading(true);
      // 1. Obtener Balances Spot y Staking
      const spotRes = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "spotClearinghouseState", user: wallet.address })
      });
      const spotData = await spotRes.json();

      // 2. Obtener Historial de Ventas (Fills)
      const fillsRes = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "userFills", user: wallet.address })
      });
      const fillsData = await fillsRes.json();

      // Procesar datos de HYPE (Token ID en Hyperliquid)
      const hypeBalance = spotData?.balances?.find(b => b.coin === 'HYPE') || { total: "0", hold: "0" };
      
      // Simular datos de gráfico basados en fills
      const chartData = fillsData
        .filter(f => f.coin === 'HYPE')
        .slice(0, 10)
        .map((f, i) => ({ val: parseFloat(f.px) }))
        .reverse();

      setData({
        balance: parseFloat(hypeBalance.total),
        isUnstaking: spotData?.unbonding?.length > 0,
        unbondingDetails: spotData?.unbonding?.[0], 
        chartData
      });
    } catch (err) {
      console.error("Error fetching wallet:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    fetchWalletData();
    const interval = setInterval(fetchWalletData, 30000); // Auto-refresh cada 30s
    return () => clearInterval(interval);
  }, [fetchWalletData]);

  const timeStatus = data?.unbondingDetails 
    ? calculateTimeRemaining(data.unbondingDetails.endTime) 
    : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-blue-500/50 transition-all shadow-xl">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${data?.balance > 0 ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            {isEditing ? (
              <input 
                className="bg-slate-800 text-white px-2 py-1 rounded border border-blue-500 outline-none w-32"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onBlur={() => { onUpdateLabel(wallet.id, newLabel); setIsEditing(false); }}
                autoFocus
              />
            ) : (
              <h3 className="text-white font-bold flex items-center gap-2 cursor-pointer" onClick={() => setIsEditing(true)}>
                {wallet.label} <Tag className="w-3 h-3 text-slate-500" />
              </h3>
            )}
            <p className="text-slate-500 text-xs font-mono">{formatAddress(wallet.address)}</p>
          </div>
        </div>
        <button onClick={() => onRemove(wallet.id)} className="text-slate-600 hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Estado Unstaking */}
        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400 flex items-center gap-1"><Timer className="w-3 h-3" /> Unstaking</span>
            <span className={timeStatus ? "text-orange-400" : "text-slate-600"}>
              {timeStatus ? `${timeStatus.days}d ${timeStatus.hours}h rem.` : 'No activo'}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-orange-500 h-full transition-all duration-1000" 
              style={{ width: timeStatus ? `${100 - (timeStatus.totalMs / UNSTAKING_PERIOD_MS * 100)}%` : '0%' }}
            />
          </div>
        </div>

        {/* Balance y Ventas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
            <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">HYPE Balance</p>
            <p className="text-white font-bold text-lg">{loading ? '...' : data?.balance?.toLocaleString()}</p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
            <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Estado</p>
            <div className="flex items-center gap-1.5">
              {data?.balance > 0 ? (
                <><Activity className="w-3 h-3 text-red-500 animate-pulse" /><span className="text-red-500 text-xs font-bold">VENDIENDO</span></>
              ) : (
                <><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500 text-xs font-bold">VACÍO</span></>
              )}
            </div>
          </div>
        </div>

        {/* Mini Gráfico */}
        <div className="h-16 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.chartData || [{val:0}]}>
              <Line type="monotone" dataKey="val" stroke={data?.balance > 0 ? "#ef4444" : "#3b82f6"} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// --- APP PRINCIPAL ---
export default function App() {
  const [wallets, setWallets] = useState(() => JSON.parse(localStorage.getItem('hl_wallets') || '[]'));
  const [inputAddr, setInputAddr] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    localStorage.setItem('hl_wallets', JSON.stringify(wallets));
  }, [wallets]);

  const addWallet = (e) => {
    e.preventDefault();
    if (!inputAddr.startsWith('0x') || inputAddr.length !== 42) return alert("Dirección Inválida");
    if (wallets.find(w => w.address.toLowerCase() === inputAddr.toLowerCase())) return alert("Ya existe");
    
    const newWallet = { id: Date.now(), address: inputAddr.toLowerCase(), label: inputLabel || 'Sin nombre' };
    setWallets([...wallets, newWallet]);
    setInputAddr(''); setInputLabel('');
  };

  const removeWallet = (id) => setWallets(wallets.filter(w => w.id !== id));
  
  const updateLabel = (id, label) => {
    setWallets(wallets.map(w => w.id === id ? { ...w, label } : w));
  };

  const filteredWallets = wallets.filter(w => 
    w.label.toLowerCase().includes(filter.toLowerCase()) || 
    w.address.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg"><TrendingUp className="text-white w-5 h-5" /></div>
            <h1 className="font-bold text-xl tracking-tight text-white">HYPE<span className="text-blue-500">Tracker</span></h1>
          </div>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              placeholder="Filtrar por etiqueta..." 
              className="bg-slate-800 border-none rounded-full py-1.5 pl-10 pr-4 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar - Formulario */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-white font-bold mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> Añadir Wallet</h2>
            <form onSubmit={addWallet} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase text-slate-500 font-bold ml-1">Dirección EVM</label>
                <input 
                  required
                  placeholder="0x..." 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-all"
                  value={inputAddr}
                  onChange={(e) => setInputAddr(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-slate-500 font-bold ml-1">Etiqueta (Opcional)</label>
                <input 
                  placeholder="Ej: Ballena 1" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-all"
                  value={inputLabel}
                  onChange={(e) => setInputLabel(e.target.value)}
                />
              </div>
              <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">
                Trackear Wallet
              </button>
            </form>
          </div>
        </div>

        {/* Dashboard - Grid */}
        <div className="lg:col-span-3">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-slate-400 font-medium">Monitoreando {filteredWallets.length} wallets</h2>
            <button 
              onClick={() => window.location.reload()}
              className="text-xs flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full transition-all"
            >
              <RefreshCw className="w-3 h-3" /> Actualizar todo
            </button>
          </div>

          {filteredWallets.length === 0 ? (
            <div className="border-2 border-dashed border-slate-800 rounded-3xl py-20 flex flex-col items-center justify-center text-slate-600">
              <Wallet className="w-12 h-12 mb-4 opacity-20" />
              <p>No hay wallets para mostrar</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredWallets.map(w => (
                <WalletCard 
                  key={w.id} 
                  wallet={w} 
                  onRemove={removeWallet} 
                  onUpdateLabel={updateLabel}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
