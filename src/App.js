import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, TrendingUp, Timer, Activity, RefreshCw, Trash2, AlertCircle, Shield Check } from 'lucide-react';

const PROXY = 'https://api.allorigins.win/raw?url=';
const API_BASE = 'https://api.hyperliquid.xyz/info';
const API_URL = `${PROXY}${encodeURIComponent(API_BASE)}`;

const formatAddress = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const WalletCard = ({ wallet, onRemove }) => {
  const [data, setData] = useState({ spot: 0, staked: 0, unbonding: 0, usdc: 0, lastUpdate: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Consultar Balances Spot y Unbonding
      const resSpot = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "spotClearinghouseState", user: wallet.address })
      });
      const spotData = await resSpot.json();

      // 2. Consultar Staking Activo (Delegaciones)
      const resStake = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "delegations", user: wallet.address })
      });
      const stakeData = await resStake.json();

      // Procesar Balances
      const hypeSpot = spotData?.balances?.find(b => b.coin === 'HYPE');
      const usdcSpot = spotData?.balances?.find(b => b.coin === 'USDC');
      
      // Sumar todo el staking activo
      const totalStaked = stakeData?.reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 0;
      
      // Ver si hay retiros en curso
      const unbondingAmount = spotData?.unbonding?.reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 0;

      setData({
        spot: parseFloat(hypeSpot?.total || 0),
        usdc: parseFloat(usdcSpot?.total || 0),
        staked: totalStaked,
        unbonding: unbondingAmount,
        lastUpdate: new Date().toLocaleTimeString()
      });
    } catch (err) {
      setError("Error leyendo datos");
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
      {loading && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse" />}
      
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-white font-bold text-lg leading-tight">{wallet.label}</h3>
          <p className="text-[10px] text-slate-500 font-mono">{wallet.address}</p>
        </div>
        <button onClick={() => onRemove(wallet.id)} className="text-slate-600 hover:text-red-500 transition-colors p-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* FILA 1: DISPONIBLE Y USDC */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <p className="text-blue-500 text-[10px] uppercase font-bold mb-1">HYPE Disponible</p>
            <p className="text-white text-xl font-mono font-bold">{data.spot.toFixed(2)}</p>
          </div>
          <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
            <p className="text-emerald-500 text-[10px] uppercase font-bold mb-1">Saldo USDC</p>
            <p className="text-white text-xl font-mono font-bold">${data.usdc.toFixed(2)}</p>
          </div>
        </div>

        {/* FILA 2: STAKING Y RETIROS */}
        <div className="bg-blue-600/5 border border-blue-500/20 p-4 rounded-xl">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-blue-400 flex items-center gap-1">
              <Activity className="w-3 h-3" /> STAKING TOTAL
            </span>
            <span className="text-white font-mono font-bold">{data.staked.toFixed(2)} HYPE</span>
          </div>
          <div className="h-px bg-slate-800 my-2" />
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-orange-400 flex items-center gap-1">
              <Timer className="w-3 h-3" /> EN RETIRO (7D)
            </span>
            <span className="text-white font-mono font-bold">{data.unbonding.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-between items-center text-[9px] text-slate-600 px-1 mt-2">
          <span>{data.lastUpdate ? `Actualizado: ${data.lastUpdate}` : 'Cargando...'}</span>
          {data.spot > 1 && <span className="text-red-500 animate-pulse font-bold">POSIBLE VENTA</span>}
        </div>
      </div>
    </div>
  );
};

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
    setWallets([...wallets, { id: Date.now(), address: cleanAddr, label: inputLabel || 'Wallet' }]);
    setInputAddr(''); setInputLabel('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-2xl shadow-lg shadow-blue-900/40"><TrendingUp className="w-8 h-8" /></div>
              HYPE<span className="text-blue-500">WHALE</span>
            </h1>
            <p className="text-slate-500 text-sm mt-2">Detección avanzada de Staking y Liquidación</p>
          </div>

          <form onSubmit={addWallet} className="flex flex-wrap gap-3 bg-slate-900/50 p-4 rounded-3xl border border-slate-800 backdrop-blur-sm">
            <input 
              placeholder="Dirección 0x..." 
              className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none w-full md:w-72 transition-all"
              value={inputAddr} onChange={(e) => setInputAddr(e.target.value)}
            />
            <input 
              placeholder="Alias" 
              className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-3 text-sm focus:border-blue-500 outline-none w-full md:w-32 transition-all"
              value={inputLabel} onChange={(e) => setInputLabel(e.target.value)}
            />
            <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20">
              Añadir
            </button>
          </form>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {wallets.map(w => (
            <WalletCard 
              key={w.id} 
              wallet={w} 
              onRemove={(id) => setWallets(wallets.filter(x => x.id !== id))} 
            />
          ))}
          {wallets.length === 0 && (
            <div className="col-span-full border-2 border-dashed border-slate-800 rounded-[40px] py-32 text-center text-slate-600 italic">
              Pega una dirección de Hyperliquid para monitorizar sus movimientos
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
