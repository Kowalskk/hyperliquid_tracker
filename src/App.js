import React, { useState, useEffect } from 'react';
import { 
  Wallet, Plus, X, Tag, TrendingUp, Menu, RefreshCw, Filter, Coins,
  AlertCircle, CheckCircle2, Clock, Timer, TrendingDown, Activity, Zap, Target
} from 'lucide-react';

const QUICKNODE_RPC = 'https://withered-red-isle.hype-mainnet.quiknode.pro/0427da894d1271966f715dc78fd65eadc08c3571/evm';

// Utilidades de tiempo
const formatTimeRemaining = (milliseconds) => {
  if (milliseconds <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  return {
    days,
    hours: hours % 24,
    minutes: minutes % 60,
    seconds: seconds % 60,
    total: milliseconds
  };
};

const calculateProgress = (startTime, endTime) => {
  const now = Date.now();
  const total = endTime - startTime;
  const elapsed = now - startTime;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
};

const formatETA = (milliseconds) => {
  if (milliseconds <= 0 || !isFinite(milliseconds)) return 'Calculando...';
  
  const time = formatTimeRemaining(milliseconds);
  
  if (time.days > 0) return `${time.days}d ${time.hours}h`;
  else if (time.hours > 0) return `${time.hours}h ${time.minutes}m`;
  else if (time.minutes > 0) return `${time.minutes}m`;
  else return `${time.seconds}s`;
};

const callRPC = async (method, params = []) => {
  try {
    const response = await fetch(QUICKNODE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'RPC Error');
    return data.result;
  } catch (error) {
    console.error('RPC Error:', error);
    throw error;
  }
};

const getNativeBalance = async (address) => {
  try {
    const balance = await callRPC('eth_getBalance', [address, 'latest']);
    return parseInt(balance, 16) / 1e18;
  } catch (error) {
    console.error('Error getting native balance:', error);
    return 0;
  }
};

const fetchHyperliquidAPI = async (payload) => {
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) return await response.json();

    const proxyResponse = await fetch('https://corsproxy.io/?' + encodeURIComponent('https://api.hyperliquid.xyz/info'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!proxyResponse.ok) throw new Error(`HTTP error! status: ${proxyResponse.status}`);
    return await proxyResponse.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

function HyperliquidDashboard() {
  const [wallets, setWallets] = useState([]);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState('');
  const [walletData, setWalletData] = useState({});
  const [loading, setLoading] = useState({});
  const [salesTracking, setSalesTracking] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterTag, setFilterTag] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    const savedWallets = localStorage.getItem('hyperliquid_wallets');
    const savedTracking = localStorage.getItem('hyperliquid_sales_tracking');
    
    if (savedWallets) {
      try { setWallets(JSON.parse(savedWallets)); } 
      catch (e) { console.error('Error loading wallets:', e); }
    }
    
    if (savedTracking) {
      try { setSalesTracking(JSON.parse(savedTracking)); } 
      catch (e) { console.error('Error loading tracking:', e); }
    }
  }, []);

  useEffect(() => {
    if (wallets.length > 0) {
      localStorage.setItem('hyperliquid_wallets', JSON.stringify(wallets));
    }
  }, [wallets]);

  useEffect(() => {
    if (Object.keys(salesTracking).length > 0) {
      localStorage.setItem('hyperliquid_sales_tracking', JSON.stringify(salesTracking));
    }
  }, [salesTracking]);

  const fetchWalletData = async (wallet) => {
    try {
      console.log(`Fetching data for wallet: ${wallet.address}`);

      const nativeBalance = await getNativeBalance(wallet.address);
      console.log('Native HYPE balance:', nativeBalance);

      // 1. SPOT EXCHANGE DATA
      let spotData = { balances: [], withdraws: [] };
      try {
        spotData = await fetchHyperliquidAPI({
          type: 'spotClearinghouseState',
          user: wallet.address
        });
        console.log('Spot exchange state:', spotData);
      } catch (e) {
        console.warn('Could not fetch spot state:', e);
      }

      // 2. STAKING DATA (endpoint específico)
      let stakingInfo = { staked: '0' };
      try {
        stakingInfo = await fetchHyperliquidAPI({
          type: 'spotMetaAndAssetCtxs'
        });
        console.log('Spot meta (for staking):', stakingInfo);
        
        // Buscar datos de staking del usuario
        const userStaking = await fetchHyperliquidAPI({
          type: 'userStakingState',
          user: wallet.address
        });
        console.log('User staking state:', userStaking);
        stakingInfo = userStaking || stakingInfo;
      } catch (e) {
        console.warn('Could not fetch staking:', e);
      }

      // Obtener fills para calcular velocidad de venta
      let fillsData = [];
      try {
        fillsData = await fetchHyperliquidAPI({
          type: 'userFills',
          user: wallet.address
        });
        console.log('Fills data:', fillsData?.length || 0, 'trades');
      } catch (e) {
        console.warn('Could not fetch fills:', e);
      }

      const exchangeBalances = spotData.balances || [];
      
      const allBalances = [];
      
      if (nativeBalance > 0) {
        allBalances.push({
          coin: 'HYPE',
          hold: nativeBalance,
          location: 'wallet'
        });
      }
      
      exchangeBalances.forEach(b => {
        const hold = parseFloat(b.hold || '0');
        if (hold > 0) {
          allBalances.push({
            coin: b.coin,
            hold: hold,
            location: 'exchange',
            entryNtl: b.entryNtl
          });
        }
      });

      const hypeOnChain = nativeBalance;
      const hypeExchange = parseFloat(exchangeBalances.find(b => b.coin === 'HYPE')?.hold || '0');
      const totalHype = hypeOnChain + hypeExchange;
      
      // STAKING: buscar en múltiples lugares
      let stakingAmount = 0;
      
      // Primero intentar de userStakingState
      if (stakingInfo.staked) {
        stakingAmount = parseFloat(stakingInfo.staked);
      } else if (stakingInfo.totalStaked) {
        stakingAmount = parseFloat(stakingInfo.totalStaked);
      } else if (stakingInfo.accountValue) {
        stakingAmount = parseFloat(stakingInfo.accountValue);
      }
      
      // WITHDRAWALS
      const pendingWithdrawals = spotData.withdraws || [];

      console.log('Staking amount:', stakingAmount);
      console.log('Pending withdrawals:', pendingWithdrawals);

      // Calcular velocidad de venta (últimas 24 horas)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentHypeSells = fillsData.filter(fill => {
        const fillTime = parseInt(fill.time);
        return fill.coin === 'HYPE' && fill.side === 'A' && fillTime >= oneDayAgo;
      });

      const volumeSoldLast24h = recentHypeSells.reduce((total, fill) => {
        return total + parseFloat(fill.sz);
      }, 0);

      // Verificar si el unstaking completó y debemos iniciar tracking
      const prevData = walletData[wallet.id];
      const prevWithdrawals = prevData?.withdraws || [];
      
      let tracking = salesTracking[wallet.id] || null;

      if (prevWithdrawals.length > 0 && pendingWithdrawals.length === 0 && !tracking && totalHype > 0) {
        tracking = {
          initialBalance: totalHype,
          startTime: Date.now(),
          initialTimestamp: Date.now()
        };
        setSalesTracking(prev => ({
          ...prev,
          [wallet.id]: tracking
        }));
        console.log('Started sales tracking for wallet:', wallet.address);
      }

      setWalletData(prev => ({
        ...prev,
        [wallet.id]: {
          nativeBalance,
          hypeOnChain,
          hypeExchange,
          totalHype,
          stakingAmount,
          allBalances,
          withdraws: pendingWithdrawals,
          volumeSoldLast24h,
          recentHypeSells,
          lastUpdate: Date.now(),
          error: null
        }
      }));

      return true;
    } catch (err) {
      console.error(`Error fetching data for ${wallet.address}:`, err);
      setWalletData(prev => ({
        ...prev,
        [wallet.id]: {
          error: err.message,
          lastUpdate: Date.now()
        }
      }));
      return false;
    }
  };

  useEffect(() => {
    if (wallets.length === 0) return;

    const fetchAllWallets = async () => {
      for (const wallet of wallets) {
        if (loading[wallet.id]) continue;
        setLoading(prev => ({ ...prev, [wallet.id]: true }));
        await fetchWalletData(wallet);
        setLoading(prev => ({ ...prev, [wallet.id]: false }));
      }
    };

    fetchAllWallets();
    const interval = setInterval(fetchAllWallets, 30000);
    return () => clearInterval(interval);
  }, [wallets.length]);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    for (const wallet of wallets) {
      setLoading(prev => ({ ...prev, [wallet.id]: true }));
      await fetchWalletData(wallet);
      setLoading(prev => ({ ...prev, [wallet.id]: false }));
    }
    setIsRefreshing(false);
  };

  const isValidAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const handleAddWallet = (e) => {
    e.preventDefault();
    setError('');

    if (!newAddress.trim()) {
      setError('La dirección no puede estar vacía');
      return;
    }

    if (!isValidAddress(newAddress.trim())) {
      setError('Dirección inválida. Debe ser formato 0x...');
      return;
    }

    if (wallets.some(w => w.address.toLowerCase() === newAddress.trim().toLowerCase())) {
      setError('Esta wallet ya está siendo trackeada');
      return;
    }

    const newWallet = {
      id: Date.now(),
      address: newAddress.trim(),
      label: newLabel.trim() || 'Sin etiqueta',
      addedAt: new Date().toISOString()
    };

    setWallets([...wallets, newWallet]);
    setNewAddress('');
    setNewLabel('');
  };

  const handleDeleteWallet = (id) => {
    setWallets(wallets.filter(w => w.id !== id));
    setWalletData(prev => {
      const newData = { ...prev };
      delete newData[id];
      return newData;
    });
    setSalesTracking(prev => {
      const newTracking = { ...prev };
      delete newTracking[id];
      return newTracking;
    });
    if (wallets.length === 1) {
      localStorage.removeItem('hyperliquid_wallets');
      localStorage.removeItem('hyperliquid_sales_tracking');
    }
  };

  const handleUpdateLabel = (id, newLabel) => {
    setWallets(wallets.map(w => 
      w.id === id ? { ...w, label: newLabel || 'Sin etiqueta' } : w
    ));
  };

  const handleResetTracking = (walletId) => {
    const data = walletData[walletId];
    if (data?.totalHype !== undefined) {
      setSalesTracking(prev => ({
        ...prev,
        [walletId]: {
          initialBalance: data.totalHype,
          startTime: Date.now(),
          initialTimestamp: Date.now()
        }
      }));
    }
  };

  const uniqueTags = [...new Set(wallets.map(w => w.label))].sort();
  const filteredWallets = filterTag ? wallets.filter(w => w.label === filterTag) : wallets;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <TrendingUp className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Hyperliquid Tracker</h1>
              <p className="text-sm text-slate-400">Staking, Unstaking & Sales Monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isRefreshing ? 'Actualizando...' : 'Actualizar'}
              </span>
            </button>
            
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  filterTag ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">{filterTag || 'Filtrar'}</span>
                {filterTag && (
                  <X 
                    className="w-3 h-3" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterTag('');
                      setShowFilterDropdown(false);
                    }}
                  />
                )}
              </button>
              
              {showFilterDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20">
                  <div className="p-2">
                    <button
                      onClick={() => {
                        setFilterTag('');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg ${!filterTag ? 'bg-slate-700' : 'hover:bg-slate-700'}`}
                    >
                      Todas
                    </button>
                    {uniqueTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          setFilterTag(tag);
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg ${filterTag === tag ? 'bg-purple-600' : 'hover:bg-slate-700'}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-slate-800 px-3 py-1.5 rounded-lg">
              <span className="text-sm">{filteredWallets.length}/{wallets.length}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-20
          w-80 bg-slate-900 border-r border-slate-800 transition-transform flex flex-col
        `}>
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-500" />
              Añadir Wallet
            </h2>
            
            <form onSubmit={handleAddWallet} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Dirección</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x81501f4da49c18bb3f69e4abfeb4d2346ac5fce8"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Etiqueta</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ej: Ballena Principal"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Añadir
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase">
              Wallets ({filteredWallets.length})
            </h3>
            
            {filteredWallets.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                {filterTag ? `Sin wallets "${filterTag}"` : 'Sin wallets'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWallets.map(wallet => {
                  const data = walletData[wallet.id];
                  const tracking = salesTracking[wallet.id];
                  const hasWithdrawals = data?.withdraws?.length > 0;
                  const hasStaking = data?.stakingAmount > 0;
                  const isSelling = tracking && data?.volumeSoldLast24h > 0;
                  
                  return (
                    <div key={wallet.id} className="bg-slate-800 rounded-lg p-3">
                      <p className="text-xs font-mono text-slate-400 truncate">
                        {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                      </p>
                      <p className="text-sm text-slate-200 font-medium mt-1">{wallet.label}</p>
                      <div className="mt-2">
                        {loading[wallet.id] ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            Cargando...
                          </div>
                        ) : isSelling ? (
                          <div className="flex items-center gap-2 text-xs text-red-400">
                            <TrendingDown className="w-3 h-3" />
                            VENDIENDO
                          </div>
                        ) : tracking ? (
                          <div className="flex items-center gap-2 text-xs text-yellow-400">
                            <Activity className="w-3 h-3" />
                            TRACKING
                          </div>
                        ) : hasWithdrawals ? (
                          <div className="flex items-center gap-2 text-xs text-yellow-400">
                            <Clock className="w-3 h-3" />
                            UNSTAKING
                          </div>
                        ) : hasStaking ? (
                          <div className="flex items-center gap-2 text-xs text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            STAKED
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Coins className="w-3 h-3" />
                            Activa
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 p-6 lg:p-8">
          {filteredWallets.length === 0 ? (
            <div className="flex items-center justify-center h-[calc(100vh-200px)]">
              <div className="text-center max-w-md">
                <Wallet className="w-20 h-20 mx-auto mb-6 text-slate-700" />
                <h2 className="text-2xl font-bold text-slate-300 mb-3">
                  Comienza a Trackear
                </h2>
                <p className="text-slate-500">
                  Añade wallets para monitorear staking, unstaking y ventas en tiempo real
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredWallets.map(wallet => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  data={walletData[wallet.id]}
                  tracking={salesTracking[wallet.id]}
                  loading={loading[wallet.id]}
                  onDelete={handleDeleteWallet}
                  onUpdateLabel={handleUpdateLabel}
                  onResetTracking={handleResetTracking}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-10" onClick={() => setSidebarOpen(false)} />
      )}
      
      {showFilterDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
      )}
    </div>
  );
}

function WalletCard({ wallet, data, tracking, loading, onDelete, onUpdateLabel, onResetTracking }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editedLabel, setEditedLabel] = useState(wallet.label);
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveLabel = () => {
    onUpdateLabel(wallet.id, editedLabel);
    setIsEditingLabel(false);
  };

  const allBalances = data?.allBalances || [];
  const totalHype = data?.totalHype || 0;
  const hypeOnChain = data?.hypeOnChain || 0;
  const hypeExchange = data?.hypeExchange || 0;
  const stakingAmount = data?.stakingAmount || 0;
  const withdraws = data?.withdraws || [];
  const volumeSoldLast24h = data?.volumeSoldLast24h || 0;

  // Calcular datos del withdrawal
  let withdrawalData = null;
  if (withdraws.length > 0) {
    const withdrawal = withdraws[0];
    const startTime = parseInt(withdrawal.time);
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const endTime = startTime + SEVEN_DAYS_MS;
    const timeRemaining = formatTimeRemaining(endTime - currentTime);
    const progress = calculateProgress(startTime, endTime);
    const isReady = timeRemaining.total <= 0;

    withdrawalData = {
      amount: parseFloat(withdrawal.amount),
      startTime,
      endTime,
      timeRemaining,
      progress,
      isReady
    };
  }

  // Calcular datos de venta
  let salesData = null;
  if (tracking && data?.totalHype !== undefined) {
    const initialBalance = tracking.initialBalance;
    const currentBalance = data.totalHype;
    const sold = Math.max(0, initialBalance - currentBalance);
    const soldPercentage = initialBalance > 0 ? (sold / initialBalance) * 100 : 0;
    
    let eta = null;
    if (volumeSoldLast24h > 0 && currentBalance > 0) {
      const daysToEmpty = currentBalance / volumeSoldLast24h;
      eta = daysToEmpty * 24 * 60 * 60 * 1000;
    }

    const isSelling = volumeSoldLast24h > 0;

    salesData = {
      initialBalance,
      currentBalance,
      sold,
      soldPercentage,
      volumeSoldLast24h,
      eta,
      isSelling
    };
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 flex-1">
          <Wallet className="w-5 h-5 text-blue-500" />
          {isEditingLabel ? (
            <input
              type="text"
              value={editedLabel}
              onChange={(e) => setEditedLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveLabel();
                if (e.key === 'Escape') { setEditedLabel(wallet.label); setIsEditingLabel(false); }
              }}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
              autoFocus
            />
          ) : (
            <h3 className="font-semibold text-slate-100 truncate">{wallet.label}</h3>
          )}
        </div>
        <button onClick={() => onDelete(wallet.id)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-slate-800 rounded-lg p-3 mb-4">
        <p className="text-xs font-mono text-slate-400 break-all">{wallet.address}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : data?.error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm text-red-400">{data.error}</p>
        </div>
      ) : (
        <>
          {stakingAmount > 0 && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-300">Staking Activo</span>
              </div>
              <div className="text-3xl font-bold text-emerald-400 mb-1">
                {stakingAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-emerald-300/70">HYPE en staking</div>
            </div>
          )}

          {withdrawalData && !withdrawalData.isReady && (
            <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Timer className="w-5 h-5 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-300">Unstaking en Progreso</span>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-100">{withdrawalData.timeRemaining.days}</div>
                  <div className="text-xs text-yellow-400">días</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-100">{withdrawalData.timeRemaining.hours}</div>
                  <div className="text-xs text-yellow-400">hrs</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-100">{withdrawalData.timeRemaining.minutes}</div>
                  <div className="text-xs text-yellow-400">min</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-100">{withdrawalData.timeRemaining.seconds}</div>
                  <div className="text-xs text-yellow-400">seg</div>
                </div>
              </div>

              <div className="relative mb-3">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all duration-1000"
                    style={{ width: `${withdrawalData.progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-slate-500">
                  <span>Inicio</span>
                  <span className="font-medium text-yellow-400">{withdrawalData.progress.toFixed(1)}%</span>
                  <span>7 días</span>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded p-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Cantidad</span>
                  <span className="font-mono font-semibold text-yellow-300">
                    {withdrawalData.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} HYPE
                  </span>
                </div>
              </div>
            </div>
          )}

          {withdrawalData?.isReady && (
            <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
                <span className="text-lg font-bold text-green-400">¡Listo para Retirar!</span>
              </div>
              <div className="text-2xl font-bold text-green-300 mb-1">
                {withdrawalData.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} HYPE
              </div>
              <div className="text-xs text-green-400">Ya puedes hacer claim en Hyperliquid</div>
            </div>
          )}

          {salesData && (
            <div className="mb-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-slate-300">Tracking de Ventas</span>
                </div>
                <button
                  onClick={() => onResetTracking(wallet.id)}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Reset
                </button>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Vendido</span>
                  <span className="font-mono">{salesData.soldPercentage.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${
                      salesData.isSelling 
                        ? 'bg-gradient-to-r from-red-500 to-orange-500' 
                        : 'bg-gradient-to-r from-slate-600 to-slate-500'
                    }`}
                    style={{ width: `${salesData.soldPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Inicial</p>
                  <p className="text-sm font-mono font-semibold text-slate-300">
                    {salesData.initialBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Actual</p>
                  <p className="text-sm font-mono font-semibold text-slate-300">
                    {salesData.currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Vendido Total</span>
                  <span className={`text-sm font-mono font-semibold ${
                    salesData.sold > 0 ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {salesData.sold.toLocaleString(undefined, { maximumFractionDigits: 0 })} HYPE
                  </span>
                </div>
              </div>

              {salesData.isSelling && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-medium text-slate-300">Velocidad (24h)</span>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Vendiendo</span>
                      <span className="text-sm font-mono font-semibold text-red-400">
                        {salesData.volumeSoldLast24h.toLocaleString(undefined, { maximumFractionDigits: 0 })} HYPE/día
                      </span>
                    </div>
                  </div>

                  {salesData.eta && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-medium text-slate-300">Tiempo Estimado</span>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-400">ETA a Balance 0</span>
                          <span className="text-sm font-mono font-semibold text-blue-400">
                            {formatETA(salesData.eta)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {!salesData.isSelling && salesData.currentBalance > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-yellow-300">Sin ventas en las últimas 24h</span>
                </div>
              )}
            </div>
          )}

          {totalHype > 0 && (
            <div className="mb-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold">Balance HYPE</span>
              </div>
              <div className="text-2xl font-bold text-slate-100 mb-3">
                {totalHype.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 rounded p-2">
                  <p className="text-xs text-slate-500">On-Chain</p>
                  <p className="text-sm font-mono text-emerald-400">
                    {hypeOnChain.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded p-2">
                  <p className="text-xs text-slate-500">Exchange</p>
                  <p className="text-sm font-mono text-blue-400">
                    {hypeExchange.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {allBalances.length > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium">Todos los Balances</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allBalances
                  .sort((a, b) => b.hold - a.hold)
                  .map((balance, idx) => (
                    <div key={idx} className="bg-slate-900/50 rounded-lg p-2 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-300">{balance.coin}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          balance.location === 'wallet' 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {balance.location === 'wallet' ? 'On-chain' : 'Exchange'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {balance.hold.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6
                        })}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            {isEditingLabel ? (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveLabel}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg"
                >
                  Guardar
                </button>
                <button
                  onClick={() => { setEditedLabel(wallet.label); setIsEditingLabel(false); }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2 rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingLabel(true)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2 rounded-lg flex items-center justify-center gap-2"
              >
                <Tag className="w-4 h-4" />
                Editar Etiqueta
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default HyperliquidDashboard;
