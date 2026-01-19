import React, { useState, useEffect } from 'react';
import { 
  Wallet, Plus, X, Tag, TrendingUp, Menu, Moon, Clock, AlertCircle, 
  CheckCircle2, Timer, TrendingDown, ArrowDownCircle, Pause, Activity,
  Zap, Target, RefreshCw, Filter
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

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
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
  return progress;
};

const formatETA = (milliseconds) => {
  if (milliseconds <= 0 || !isFinite(milliseconds)) return 'Calculando...';
  
  const time = formatTimeRemaining(milliseconds);
  
  if (time.days > 0) {
    return `${time.days}d ${time.hours}h`;
  } else if (time.hours > 0) {
    return `${time.hours}h ${time.minutes}m`;
  } else if (time.minutes > 0) {
    return `${time.minutes}m ${time.seconds}s`;
  } else {
    return `${time.seconds}s`;
  }
};

// Generar datos del sparkline basado en fills
const generateSparklineData = (tracking, currentBalance, fills, hours = 12) => {
  if (!tracking) return [];

  const now = Date.now();
  const startTime = tracking.startTime;
  const timeRange = hours * 60 * 60 * 1000; // Convertir horas a ms
  const interval = timeRange / 12; // 12 puntos en el gráfico

  const data = [];
  
  // Ordenar fills por tiempo
  const sortedFills = [...fills].sort((a, b) => parseInt(a.time) - parseInt(b.time));
  
  // Generar puntos de datos
  for (let i = 12; i >= 0; i--) {
    const pointTime = now - (i * interval);
    
    // Calcular balance en ese momento
    let balanceAtPoint = currentBalance;
    
    // Sumar todos los fills que ocurrieron después de este punto
    sortedFills.forEach(fill => {
      const fillTime = parseInt(fill.time);
      if (fillTime > pointTime && fill.side === 'A') { // Solo sells
        balanceAtPoint += parseFloat(fill.sz);
      }
    });
    
    data.push({
      time: pointTime,
      balance: Math.max(0, balanceAtPoint)
    });
  }
  
  return data;
};

// Componente principal del Dashboard
const HyperliquidDashboard = () => {
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

  // Cargar wallets y sales tracking desde localStorage
  useEffect(() => {
    const savedWallets = localStorage.getItem('hyperliquid_wallets');
    const savedTracking = localStorage.getItem('hyperliquid_sales_tracking');
    
    if (savedWallets) {
      try {
        setWallets(JSON.parse(savedWallets));
      } catch (e) {
        console.error('Error loading wallets:', e);
      }
    }
    
    if (savedTracking) {
      try {
        setSalesTracking(JSON.parse(savedTracking));
      } catch (e) {
        console.error('Error loading sales tracking:', e);
      }
    }
  }, []);

  // Guardar wallets en localStorage
  useEffect(() => {
    if (wallets.length > 0) {
      localStorage.setItem('hyperliquid_wallets', JSON.stringify(wallets));
    }
  }, [wallets]);

  // Guardar sales tracking en localStorage
  useEffect(() => {
    if (Object.keys(salesTracking).length > 0) {
      localStorage.setItem('hyperliquid_sales_tracking', JSON.stringify(salesTracking));
    }
  }, [salesTracking]);

  // Fetch datos de una wallet específica
  const fetchWalletData = async (wallet) => {
    try {
      // 1. Obtener estado de clearinghouse
      const stateResponse = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'spotClearinghouseState',
          user: wallet.address
        })
      });

      if (!stateResponse.ok) throw new Error(`HTTP error! status: ${stateResponse.status}`);
      const stateData = await stateResponse.json();

      // 2. Obtener fills
      const fillsResponse = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFills',
          user: wallet.address
        })
      });

      let fillsData = [];
      if (fillsResponse.ok) {
        fillsData = await fillsResponse.json();
      }

      const currentHypeBalance = parseFloat(stateData.balances?.find(b => b.coin === 'HYPE')?.hold || '0');
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
      
      // Filtrar fills de HYPE
      const hypeFills = fillsData.filter(fill => fill.coin === 'HYPE');
      
      // Filtrar fills recientes (última hora)
      const recentHypeFills = hypeFills.filter(fill => {
        const fillTime = parseInt(fill.time);
        return fillTime >= oneHourAgo;
      });

      // Filtrar fills de últimas 12 horas para el gráfico
      const last12HoursFills = hypeFills.filter(fill => {
        const fillTime = parseInt(fill.time);
        return fillTime >= twelveHoursAgo;
      });

      // Calcular volumen vendido en la última hora
      const volumeSoldLastHour = recentHypeFills.reduce((total, fill) => {
        if (fill.side === 'A') {
          return total + parseFloat(fill.sz);
        }
        return total;
      }, 0);

      // Verificar si el unstaking acaba de completarse
      const prevData = walletData[wallet.id];
      const prevWithdrawals = prevData?.withdraws || [];
      const currentWithdrawals = stateData.withdraws || [];
      
      let tracking = salesTracking[wallet.id] || null;

      if (prevWithdrawals.length > 0 && currentWithdrawals.length === 0 && !tracking) {
        tracking = {
          initialBalance: currentHypeBalance,
          startTime: Date.now(),
          initialTimestamp: Date.now()
        };
        setSalesTracking(prev => ({
          ...prev,
          [wallet.id]: tracking
        }));
      }

      // Actualizar datos de la wallet
      setWalletData(prev => ({
        ...prev,
        [wallet.id]: {
          ...stateData,
          currentHypeBalance,
          recentHypeFills,
          hypeFills: last12HoursFills,
          volumeSoldLastHour,
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

  // Fetch inicial de todas las wallets
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

  // Refrescar todas las wallets manualmente
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
    if (data?.currentHypeBalance !== undefined) {
      setSalesTracking(prev => ({
        ...prev,
        [walletId]: {
          initialBalance: data.currentHypeBalance,
          startTime: Date.now(),
          initialTimestamp: Date.now()
        }
      }));
    }
  };

  // Obtener etiquetas únicas
  const uniqueTags = [...new Set(wallets.map(w => w.label))].sort();

  // Filtrar wallets por etiqueta
  const filteredWallets = filterTag 
    ? wallets.filter(w => w.label === filterTag)
    : wallets;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
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
              <p className="text-sm text-slate-400">Staking, Withdrawals & Sales Monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Botón de Actualizar Todo */}
            <button
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed
                text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isRefreshing ? 'Actualizando...' : 'Actualizar Todo'}
              </span>
            </button>
            
            {/* Filtro por Etiqueta */}
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  filterTag 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {filterTag || 'Filtrar'}
                </span>
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
                    <div className="text-xs text-slate-400 px-2 py-1 mb-1">Filtrar por etiqueta</div>
                    <button
                      onClick={() => {
                        setFilterTag('');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        !filterTag 
                          ? 'bg-slate-700 text-white' 
                          : 'hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      Todas las wallets
                    </button>
                    {uniqueTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          setFilterTag(tag);
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          filterTag === tag 
                            ? 'bg-purple-600 text-white' 
                            : 'hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-slate-800 px-3 py-1.5 rounded-lg">
              <span className="text-sm text-slate-300">
                {filteredWallets.length}/{wallets.length} Wallets
              </span>
            </div>
            <Moon className="w-5 h-5 text-slate-400" />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-20
          w-80 bg-slate-900 border-r border-slate-800 transition-transform duration-300
          flex flex-col
        `}>
          <div className="p-6 border-b border-slate-800">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-500" />
              Añadir Wallet
            </h2>
            
            <form onSubmit={handleAddWallet} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Dirección
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Etiqueta / Alias
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ej: Ballena Insider"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    placeholder-slate-500"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg
                  transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Añadir Wallet
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
              Wallets Trackeadas ({filteredWallets.length})
            </h3>
            
            {filteredWallets.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                {filterTag ? `No hay wallets con la etiqueta "${filterTag}"` : 'No hay wallets añadidas aún'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWallets.map(wallet => {
                  const data = walletData[wallet.id];
                  const tracking = salesTracking[wallet.id];
                  const hasPendingWithdrawal = data?.withdraws && data.withdraws.length > 0;
                  const isStaked = data?.staking && parseFloat(data.staking) > 0;
                  const isSelling = tracking && data?.volumeSoldLastHour > 0;
                  
                  return (
                    <div
                      key={wallet.id}
                      className="bg-slate-800 rounded-lg p-3 hover:bg-slate-750 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-slate-400 truncate">
                            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                          </p>
                          <p className="text-sm text-slate-200 font-medium mt-1">
                            {wallet.label}
                          </p>
                        </div>
                      </div>
                      
                      {/* Status indicator */}
                      <div className="mt-2">
                        {loading[wallet.id] ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            Cargando...
                          </div>
                        ) : isSelling ? (
                          <div className="flex items-center gap-2 text-xs text-red-400">
                            <TrendingDown className="w-3 h-3" />
                            SELLING
                          </div>
                        ) : tracking ? (
                          <div className="flex items-center gap-2 text-xs text-yellow-400">
                            <Pause className="w-3 h-3" />
                            HOLDING
                          </div>
                        ) : hasPendingWithdrawal ? (
                          <div className="flex items-center gap-2 text-xs text-yellow-400">
                            <Clock className="w-3 h-3" />
                            Unstaking
                          </div>
                        ) : isStaked ? (
                          <div className="flex items-center gap-2 text-xs text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Staked
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <AlertCircle className="w-3 h-3" />
                            Sin actividad
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

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8">
          {filteredWallets.length === 0 ? (
            <div className="flex items-center justify-center h-[calc(100vh-200px)]">
              <div className="text-center max-w-md">
                <Wallet className="w-20 h-20 mx-auto mb-6 text-slate-700" />
                <h2 className="text-2xl font-bold text-slate-300 mb-3">
                  {filterTag ? `No hay wallets con la etiqueta "${filterTag}"` : 'Comienza a Trackear Wallets'}
                </h2>
                <p className="text-slate-500 mb-6">
                  {filterTag 
                    ? 'Prueba con un filtro diferente o añade wallets con esta etiqueta.' 
                    : 'Añade direcciones de Hyperliquid para monitorear staking, unstaking y ventas en tiempo real.'
                  }
                </p>
                {filterTag && (
                  <button
                    onClick={() => setFilterTag('')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors"
                  >
                    Ver todas las wallets
                  </button>
                )}
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

      {/* Overlay para cerrar sidebar en móvil */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-10"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Overlay para cerrar filtro dropdown */}
      {showFilterDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowFilterDropdown(false)}
        />
      )}
    </div>
  );
};

// Componente de tarjeta de wallet
const WalletCard = ({ wallet, data, tracking, loading, onDelete, onUpdateLabel, onResetTracking }) => {
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

  const handleCancelEdit = () => {
    setEditedLabel(wallet.label);
    setIsEditingLabel(false);
  };

  // Procesar datos de staking
  const stakingAmount = data?.staking ? parseFloat(data.staking) : 0;
  const pendingWithdrawals = data?.withdraws || [];
  const hasPendingWithdrawal = pendingWithdrawals.length > 0;

  // Calcular datos del retiro pendiente
  let withdrawalData = null;
  if (hasPendingWithdrawal) {
    const withdrawal = pendingWithdrawals[0];
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
  if (tracking && data?.currentHypeBalance !== undefined) {
    const initialBalance = tracking.initialBalance;
    const currentBalance = data.currentHypeBalance;
    const sold = Math.max(0, initialBalance - currentBalance);
    const soldPercentage = initialBalance > 0 ? (sold / initialBalance) * 100 : 0;
    const volumeLastHour = data.volumeSoldLastHour || 0;
    
    // Calcular ETA
    let eta = null;
    if (volumeLastHour > 0 && currentBalance > 0) {
      const hoursToEmpty = currentBalance / volumeLastHour;
      eta = hoursToEmpty * 60 * 60 * 1000;
    }

    const isSelling = volumeLastHour > 0;
    const isHolding = volumeLastHour === 0 && currentBalance > 0;

    salesData = {
      initialBalance,
      currentBalance,
      sold,
      soldPercentage,
      volumeLastHour,
      eta,
      isSelling,
      isHolding
    };
  }

  // Generar datos para sparkline
  const sparklineData = tracking && data?.hypeFills 
    ? generateSparklineData(tracking, data.currentHypeBalance, data.hypeFills, 12)
    : [];

  // Determinar estado
  let status = 'inactive';
  let statusText = 'Sin actividad';

  if (loading) {
    status = 'loading';
    statusText = 'Cargando...';
  } else if (data?.error) {
    status = 'error';
    statusText = 'Error';
  } else if (salesData?.isSelling) {
    status = 'selling';
    statusText = 'SELLING';
  } else if (salesData?.isHolding) {
    status = 'holding';
    statusText = 'HOLDING';
  } else if (withdrawalData?.isReady) {
    status = 'ready';
    statusText = 'Listo para retirar';
  } else if (hasPendingWithdrawal) {
    status = 'unstaking';
    statusText = 'Unstaking';
  } else if (stakingAmount > 0) {
    status = 'staked';
    statusText = 'Staked';
  }

  const statusStyles = {
    loading: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
    selling: 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse',
    holding: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    ready: 'bg-green-500/10 text-green-400 border-green-500/20',
    unstaking: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    staked: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    inactive: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Wallet className="w-5 h-5 text-blue-500 flex-shrink-0" />
          {isEditingLabel ? (
            <input
              type="text"
              value={editedLabel}
              onChange={(e) => setEditedLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveLabel();
                if (e.key === 'Escape') handleCancelEdit();
              }}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
              autoFocus
            />
          ) : (
            <h3 className="font-semibold text-slate-100 truncate">{wallet.label}</h3>
          )}
        </div>
        <button
          onClick={() => onDelete(wallet.id)}
          className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-red-400 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Dirección */}
      <div className="bg-slate-800 rounded-lg p-3 mb-4">
        <p className="text-xs font-mono text-slate-400 break-all">
          {wallet.address}
        </p>
      </div>

      {/* Estado Badge */}
      <div className={`border rounded-lg px-3 py-2 mb-4 flex items-center gap-2 ${statusStyles[status]}`}>
        {status === 'loading' && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
        {status === 'selling' && <TrendingDown className="w-4 h-4" />}
        {status === 'holding' && <Pause className="w-4 h-4" />}
        {status === 'ready' && <CheckCircle2 className="w-4 h-4" />}
        {status === 'unstaking' && <Clock className="w-4 h-4" />}
        {status === 'staked' && <CheckCircle2 className="w-4 h-4" />}
        {status === 'error' && <AlertCircle className="w-4 h-4" />}
        <span className="text-sm font-medium">{statusText}</span>
      </div>

      {/* Sparkline Chart */}
      {sparklineData.length > 0 && (
        <div className="mb-4 bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">Balance HYPE (12h)</span>
            <span className="text-xs font-mono text-slate-300">
              {data?.currentHypeBalance?.toLocaleString(undefined, {maximumFractionDigits: 2})}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart data={sparklineData}>
              <Line 
                type="monotone" 
                dataKey="balance" 
                stroke={salesData?.isSelling ? "#ef4444" : "#10b981"}
                strokeWidth={2}
                dot={false}
                animationDuration={300}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sales Tracking Section */}
      {salesData && (
        <div className="mb-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-slate-300">Tracking de Ventas</span>
            </div>
            <button
              onClick={() => onResetTracking(wallet.id)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Progress Bar - Tokens Vendidos */}
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
                    : 'bg-gradient-to-r from-yellow-500 to-green-500'
                }`}
                style={{ width: `${salesData.soldPercentage}%` }}
              />
            </div>
          </div>

          {/* Balance Info */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Balance Inicial</p>
              <p className="text-sm font-mono font-semibold text-slate-300">
                {salesData.initialBalance.toLocaleString(undefined, {maximumFractionDigits: 2})}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Balance Actual</p>
              <p className="text-sm font-mono font-semibold text-slate-300">
                {salesData.currentBalance.toLocaleString(undefined, {maximumFractionDigits: 2})}
              </p>
            </div>
          </div>

          {/* Vendido */}
          <div className="bg-slate-900/50 rounded-lg p-3 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Vendido Total</span>
              <span className={`text-sm font-mono font-semibold ${
                salesData.sold > 0 ? 'text-red-400' : 'text-slate-400'
              }`}>
                {salesData.sold.toLocaleString(undefined, {maximumFractionDigits: 2})} HYPE
              </span>
            </div>
          </div>

          {/* Velocidad de Venta */}
          {salesData.isSelling && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-medium text-slate-300">Velocidad de Venta</span>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-slate-400">Última hora</span>
                  <span className="text-sm font-mono font-semibold text-red-400">
                    {salesData.volumeLastHour.toLocaleString(undefined, {maximumFractionDigits: 2})} HYPE/h
                  </span>
                </div>
              </div>

              {/* ETA */}
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
        </div>
      )}

      {/* Withdrawal Countdown */}
      {withdrawalData && !withdrawalData.isReady && (
        <div className="mb-4 bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Timer className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-slate-300">Tiempo restante</span>
          </div>
          
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-100">{withdrawalData.timeRemaining.days}</div>
              <div className="text-xs text-slate-500">días</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-100">{withdrawalData.timeRemaining.hours}</div>
              <div className="text-xs text-slate-500">hrs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-100">{withdrawalData.timeRemaining.minutes}</div>
              <div className="text-xs text-slate-500">min</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-100">{withdrawalData.timeRemaining.seconds}</div>
              <div className="text-xs text-slate-500">seg</div>
            </div>
          </div>

          <div className="relative">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all duration-1000 ease-linear"
                style={{ width: `${withdrawalData.progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-slate-500">
              <span>0%</span>
              <span className="font-medium text-slate-400">{withdrawalData.progress.toFixed(1)}%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-700">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Cantidad</span>
              <span className="font-mono font-semibold text-slate-200">
                {withdrawalData.amount.toLocaleString()} USD
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Ready to Withdraw */}
      {withdrawalData?.isReady && (
        <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="text-sm font-semibold text-green-400">¡Retiro disponible!</span>
          </div>
          <div className="flex justify-between text-sm mt-3">
            <span className="text-slate-400">Cantidad</span>
            <span className="font-mono font-semibold text-green-400">
              {withdrawalData.amount.toLocaleString()} USD
            </span>
          </div>
        </div>
      )}

      {/* Staking Info */}
      <div className="space-y-2">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Staking Balance</span>
            <span className="text-sm font-mono font-semibold text-slate-200">
              {stakingAmount > 0 ? `${stakingAmount.toLocaleString()} USD` : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-2 mt-4">
        {isEditingLabel ? (
          <>
            <button
              onClick={handleSaveLabel}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg transition-colors"
            >
              Guardar
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditingLabel(true)}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Tag className="w-4 h-4" />
            Editar Etiqueta
          </button>
        )}
      </div>

      {/* Error display */}
      {data?.error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-xs text-red-400">{data.error}</p>
        </div>
      )}
    </div>
  );
};

export default HyperliquidDashboard;
