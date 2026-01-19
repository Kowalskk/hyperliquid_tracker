import React, { useState, useEffect } from 'react';
import { 
  Wallet, Plus, X, Tag, TrendingUp, Menu, Moon, Clock, AlertCircle, 
  CheckCircle2, Timer, TrendingDown, Pause, Activity,
  Zap, Target, RefreshCw, Filter, Coins
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Tu RPC de QuickNode
const QUICKNODE_RPC = 'https://withered-red-isle.hype-mainnet.quiknode.pro/0427da894d1271966f715dc78fd65eadc08c3571/evm';

// Dirección del contrato de HYPE (necesitarás la correcta)
const HYPE_TOKEN_ADDRESS = '0x...'; // Actualizar con la dirección real

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

// Función para hacer llamadas RPC
const callRPC = async (method, params = []) => {
  try {
    const response = await fetch(QUICKNODE_RPC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'RPC Error');
    }

    return data.result;
  } catch (error) {
    console.error('RPC Error:', error);
    throw error;
  }
};

// Función para obtener balance nativo (HYPE)
const getNativeBalance = async (address) => {
  try {
    const balance = await callRPC('eth_getBalance', [address, 'latest']);
    // Convertir de wei a ether (18 decimals)
    const balanceInEther = parseInt(balance, 16) / 1e18;
    return balanceInEther;
  } catch (error) {
    console.error('Error getting native balance:', error);
    return 0;
  }
};

// Función para obtener balance de token ERC20
const getTokenBalance = async (walletAddress, tokenAddress) => {
  try {
    // balanceOf(address) selector: 0x70a08231
    const data = '0x70a08231' + walletAddress.slice(2).padStart(64, '0');
    
    const balance = await callRPC('eth_call', [
      {
        to: tokenAddress,
        data: data
      },
      'latest'
    ]);

    return parseInt(balance, 16) / 1e18;
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
};

// Función para llamar a la API de Hyperliquid Info
const fetchHyperliquidAPI = async (payload) => {
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Intentar con proxy CORS
      const proxyResponse = await fetch('https://corsproxy.io/?' + encodeURIComponent('https://api.hyperliquid.xyz/info'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!proxyResponse.ok) {
        throw new Error(`HTTP error! status: ${proxyResponse.status}`);
      }

      return await proxyResponse.json();
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// Generar datos del sparkline
const generateSparklineData = (tracking, currentBalance, fills, hours = 12) => {
  if (!tracking) return [];

  const now = Date.now();
  const timeRange = hours * 60 * 60 * 1000;
  const interval = timeRange / 12;

  const data = [];
  const sortedFills = [...fills].sort((a, b) => parseInt(a.time) - parseInt(b.time));
  
  for (let i = 12; i >= 0; i--) {
    const pointTime = now - (i * interval);
    let balanceAtPoint = currentBalance;
    
    sortedFills.forEach(fill => {
      const fillTime = parseInt(fill.time);
      if (fillTime > pointTime && fill.side === 'A') {
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
      console.log(`Fetching data for wallet: ${wallet.address}`);

      // 1. Obtener balance nativo de HYPE (en la blockchain)
      const nativeBalance = await getNativeBalance(wallet.address);
      console.log('Native HYPE balance:', nativeBalance);

      // 2. Obtener datos del clearinghouse (exchange)
      let stateData = { balances: [], withdraws: [], staking: '0' };
      try {
        stateData = await fetchHyperliquidAPI({
          type: 'spotClearinghouseState',
          user: wallet.address
        });
        console.log('Clearinghouse state:', stateData);
      } catch (e) {
        console.warn('Could not fetch clearinghouse state:', e);
      }

      // 3. Obtener fills (trades)
      let fillsData = [];
      try {
        fillsData = await fetchHyperliquidAPI({
          type: 'userFills',
          user: wallet.address
        });
        console.log('Fills data:', fillsData);
      } catch (e) {
        console.warn('Could not fetch fills:', e);
      }

      // Procesar balances
      const exchangeBalances = stateData.balances || [];
      
      // Combinar balance on-chain + exchange
      const allBalances = [
        {
          coin: 'HYPE (Wallet)',
          hold: nativeBalance,
          total: nativeBalance,
          location: 'wallet'
        },
        ...exchangeBalances.map(b => ({
          coin: `${b.coin} (Exchange)`,
          hold: parseFloat(b.hold || '0'),
          total: parseFloat(b.total || '0'),
          location: 'exchange'
        }))
      ];

      // Balance total de HYPE
      const walletHype = nativeBalance;
      const exchangeHype = parseFloat(exchangeBalances.find(b => b.coin === 'HYPE')?.hold || '0');
      const totalHypeBalance = walletHype + exchangeHype;

      console.log('Total HYPE:', { wallet: walletHype, exchange: exchangeHype, total: totalHypeBalance });

      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
      
      // Filtrar fills de HYPE
      const hypeFills = fillsData.filter(fill => fill.coin === 'HYPE');
      
      // Filtrar fills recientes (última hora)
      const recentHypeFills = hypeFills.filter(fill => {
        const fillTime = parseInt(fill.time);
        return fillTime >= oneHourAgo;
      });

      // Filtrar fills de últimas 12 horas
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

      if (prevWithdrawals.length > 0 && currentWithdrawals.length === 0 && !tracking && totalHypeBalance > 0) {
        tracking = {
          initialBalance: totalHypeBalance,
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
          nativeBalance,
          walletHype,
          exchangeHype,
          totalHypeBalance,
          tokenBalances: allBalances,
          currentHypeBalance: totalHypeBalance,
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
    if (data?.totalHypeBalance !== undefined) {
      setSalesTracking(prev => ({
        ...prev,
        [walletId]: {
          initialBalance: data.totalHypeBalance,
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
              <p className="text-sm text-slate-400">Wallet & Exchange Balance Monitor</p>
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
        {/* Sidebar - Mantengo el código igual */}
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
                  placeholder="0xcd1a5fb7c3a5ad2a13fce54853b3c3a01396e525"
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
                    : 'Añade direcciones de Hyperliquid para monitorear balances on-chain y en el exchange.'
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

      {/* Overlays */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-10"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {showFilterDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowFilterDropdown(false)}
        />
      )}
    </div>
  );
};

// Componente WalletCard - Actualizado para mostrar balances correctamente
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

  // Procesar datos
  const stakingAmount = data?.staking ? parseFloat(data.staking) : 0;
  const pendingWithdrawals = data?.withdraws || [];
  const hasPendingWithdrawal = pendingWithdrawals.length > 0;
  const tokenBalances = data?.tokenBalances || [];
  const walletHype = data?.walletHype || 0;
  const exchangeHype = data?.exchangeHype || 0;
  const totalHype = data?.totalHypeBalance || 0;

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
  if (tracking && data?.totalHypeBalance !== undefined) {
    const initialBalance = tracking.initialBalance;
    const currentBalance = data.totalHypeBalance;
    const sold = Math.max(0, initialBalance - currentBalance);
    const soldPercentage = initialBalance > 0 ? (sold / initialBalance) * 100 : 0;
    const volumeLastHour = data.volumeSoldLastHour || 0;
    
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
    ? generateSparklineData(tracking, data.totalHypeBalance, data.hypeFills, 12)
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

      {/* HYPE Balance Summary */}
      {totalHype > 0 && (
        <div className="mb-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">Balance Total HYPE</span>
          </div>
          <div className="text-3xl font-bold text-slate-100 mb-3">
            {totalHype.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-xs text-slate-500">En Wallet</p>
              <p className="text-sm font-mono text-emerald-400">
                {walletHype.toLocaleString(undefined, {maximumFractionDigits: 2})}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded p-2">
              <p className="text-xs text-slate-500">En Exchange</p>
              <p className="text-sm font-mono text-blue-400">
                {exchangeHype.toLocaleString(undefined, {maximumFractionDigits: 2})}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Token Balances Completos */}
      {tokenBalances.length > 0 && (
        <div className="mb-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-slate-300">Todos los Balances</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {tokenBalances
              .filter(b => b.hold > 0)
              .sort((a, b) => b.hold - a.hold)
              .map((balance, idx) => (
                <div key={idx} className="bg-slate-900/50 rounded-lg p-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-300">{balance.coin}</span>
                    {balance.location === 'wallet' && (
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                        On-chain
                      </span>
                    )}
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

      {/* Resto del código del card (sparkline, sales tracking, etc.) igual que antes... */}
      
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
```

## 🔑 **Cambios Clave:**

### 1. **Integración RPC QuickNode**
- Función `callRPC()` para llamadas JSON-RPC
- `getNativeBalance()` obtiene balance nativo (HYPE en wallet)
- `getTokenBalance()` para tokens ERC20 (si necesitas)

### 2. **Doble Tracking**
- **Balance On-chain**: HYPE en la wallet (RPC)
- **Balance Exchange**: HYPE en Hyperliquid Exchange (API Info)
- **Balance Total**: Suma de ambos

### 3. **Visualización Mejorada**
- Resumen grande con balance total
- Separación "En Wallet" vs "En Exchange"
- Badge "On-chain" para balances de wallet
- Colores distintivos (verde=wallet, azul=exchange)

## 🧪 **Testing**

Abre la consola (F12) y verás:
```
Fetching data for wallet: 0x...
Native HYPE balance: 1234.56
Clearinghouse state: {...}
Total HYPE: {wallet: 1234.56, exchange: 789.12, total: 2023.68}
