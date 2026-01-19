import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wallet, Plus, X, Tag, TrendingUp, Clock, AlertCircle, 
  CheckCircle2, Timer, Activity, RefreshCw, Search, Trash2, DollarSign
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// --- CONFIGURACIÓN ---
// Probamos con un proxy diferente más estable
const PROXY = 'https://api.allorigins.win/raw?url=';
const API_BASE = 'https://api.hyperliquid.xyz/info';
const API_URL = `${PROXY}${encodeURIComponent(API_BASE)}`;
const UNSTAKING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

const formatAddress = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

// --- COMPONENTE DE TARJETA ---
const WalletCard = ({ wallet, onRemove, onUpdateLabel }) => {
  const [data, setData] = useState({ balance: 0, usdc: 0, staking: 0, isUnstaking: false, lastUpdate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWalletData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "spotClearinghouseState", user: wallet.address })
      });

      if (!response.ok) throw new Error('Error de conexión con API');
      
      const spotData = await response.json();
      
      // Extraer balances
      const hypeAsset = spotData?.balances?.find(b => b.coin === 'HYPE');
      const usdcAsset = spotData?.balances?.find(b => b.coin === 'USDC');
      
      // Extraer Unstaking
      const unbonding = spotData?.unbonding?.length > 0 ? spotData.unbonding[0] : null;

      setData({
        balance: parseFloat(hypeAsset?.total || 0),
        usdc: parseFloat(usdcAsset?.total || 0),
        staking: unbonding ? parseFloat(unbonding.amount) : 0,
        isUnstaking: !!unbonding,
        unbondingDetails: unbonding,
        lastUpdate: new Date().toLocaleTimeString()
      });
    } catch (err) {
      console.error("Error:", err);
      setError("Error de API o Wallet sin actividad");
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    fetchWalletData();
    const interval = setInterval(fetchWalletData, 60000);
    return () => clearInterval(interval);
  }, [fetchWalletData]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
      {loading && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse" />}
      
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-bold text-lg">{wallet.label}</h3>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {formatAddress(wallet.address)}
            </span>
          </div>
          {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
        </div>
        <button onClick={() => onRemove(wallet.id)} className="text-slate-600 hover:text-red-500 transition-colors p-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* SECCIÓN DE BALANCES REALES */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <p className="text-slate-500 text-[10px] uppercase font-bold">Saldo HYPE</p>
            </div>
            <p className="text-white text-xl font-mono font-bold">
              {data.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <p className="text-slate-500 text-[10px] uppercase font-bold">Saldo USDC</p>
            </div>
            <p className="text-white text-xl font-mono font-bold">
              ${data.usdc.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* MONITOR DE UNSTAKING */}
        <div className={`p-4 rounded-xl border ${data.isUnstaking ? 'bg-orange-500/5 border-orange-500/20' : 'bg-slate-950/30 border-slate-800'}`}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Timer className={`w-4 h-4 ${data.isUnstaking ? 'text-orange-500' : 'text-slate-500'}`} />
              <span className="text-xs font-bold text-slate-300">Unstaking Queue</span>
            </div>
            {data.isUnstaking && <span className="text-[10px] text-orange-500 font-bold animate-pulse">PROCESANDO</span>}
          </div>
          
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] text-slate-500 uppercase">Monto bloqueado</p>
              <p className={`text-lg font-bold ${data.isUnstaking ? 'text-white' : 'text-slate-700'}`}>
                {data.staking.toLocaleString()} HYPE
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase">Estado</p>
              <p className={`text-xs font-bold ${data.isUnstaking ? 'text-orange-400' : 'text-slate-600'}`}>
                {data.isUnstaking ? 'En espera (7d)' : 'Sin retiros'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center text-[10px] text-slate-600 px-1">
          <span>Auto-refresh: 60s</span>
          <span>Actualizado: {data.lastUpdate || '--:--'}</span>
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

  useEffect(() => {
    localStorage.setItem('hl_wallets', JSON.stringify(wallets));
  }, [wallets]);

  const addWallet = (e) => {
    e.preventDefault();
    const cleanAddr = inputAddr.trim().toLowerCase();
    if (!cleanAddr.startsWith('0x') || cleanAddr.length !== 42) return alert("Dirección inválida");
    if (wallets.find(w => w.address === cleanAddr)) return alert("Wallet ya añadida");
    
    setWallets([...wallets, { id: Date.now(), address: cleanAddr, label: inputLabel || 'Sin nombre' }]);
    setInputAddr(''); setInputLabel('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
              HYPE<span className="text-blue-500">WHALE</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">Monitoreo de Unstaking y Balances en tiempo real</p>
          </div>

          <form onSubmit={addWallet} className="flex flex-wrap gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-800 shadow-xl">
            <input 
              placeholder="Dirección 0x..." 
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none w-full md:w-64"
              value={inputAddr} onChange={(e) => setInputAddr(e.target.value)}
            />
            <input 
              placeholder="Alias (ej: Ballena 1)" 
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:border-blue-500 outline-none w-full md:w-40"
              value={inputLabel} onChange={(e) => setInputLabel(e.target.value)}
            />
            <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
              <Plus className="w-4 h-4" /> Añadir
            </button>
          </form>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {wallets.map(w => (
            <WalletCard 
              key={w.id} 
              wallet={w} 
              onRemove={(id) => setWallets(wallets.filter(x => x.id !== id))} 
            />
          ))}
          {wallets.length === 0 && (
            <div className="col-span-full border-2 border-dashed border-slate-800 rounded-3xl py-20 text-center text-slate-600">
              <p>No hay wallets activas. Añade una arriba para empezar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
