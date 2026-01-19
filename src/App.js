import React, { useState, useEffect } from 'react';
import { 
  Wallet, Plus, X, Tag, TrendingUp, Menu, RefreshCw, Filter, Coins,
  AlertCircle, CheckCircle2, Clock, Pause, TrendingDown
} from 'lucide-react';

const QUICKNODE_RPC = 'https://withered-red-isle.hype-mainnet.quiknode.pro/0427da894d1271966f715dc78fd65eadc08c3571/evm';

// Función para llamadas RPC
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

// Función para llamar a la API de Hyperliquid
const fetchHyperliquidAPI = async (payload) => {
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) return await response.json();

    // Intentar con proxy CORS
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

const HyperliquidDashboard = () => {
  const [wallets, setWallets] = useState([]);
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState('');
  const [walletData, setWalletData] = useState({});
  const [loading, setLoading] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterTag, setFilterTag] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    const savedWallets = localStorage.getItem('hyperliquid_wallets');
    if (savedWallets) {
      try {
        setWallets(JSON.parse(savedWallets));
      } catch (e) {
        console.error('Error loading wallets:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (wallets.length > 0) {
      localStorage.setItem('hyperliquid_wallets', JSON.stringify(wallets));
    }
  }, [wallets]);

  const fetchWalletData = async (wallet) => {
    try {
      console.log(`Fetching data for wallet: ${wallet.address}`);

      // 1. Balance on-chain
      const nativeBalance = await getNativeBalance(wallet.address);
      console.log('Native HYPE balance:', nativeBalance);

      // 2. Exchange data
      let stateData = { balances: [], withdraws: [], staking: '0' };
      try {
        stateData = await fetchHyperliquidAPI({
          type: 'spotClearinghouseState',
          user: wallet.address
        });
        console.log('Exchange state:', stateData);
      } catch (e) {
        console.warn('Could not fetch exchange state:', e);
      }

      // Procesar balances
      const exchangeBalances = stateData.balances || [];
      
      // Combinar todos los balances
      const allBalances = [];
      
      // Añadir balance on-chain de HYPE
      if (nativeBalance > 0) {
        allBalances.push({
          coin: 'HYPE',
          hold: nativeBalance,
          location: 'wallet'
        });
      }
      
      // Añadir balances del exchange
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

      // Balance específico de HYPE
      const hypeOnChain = nativeBalance;
      const hypeExchange = parseFloat(exchangeBalances.find(b => b.coin === 'HYPE')?.hold || '0');
      const totalHype = hypeOnChain + hypeExchange;

      // Staking
      const stakingAmount = parseFloat(stateData.staking || '0');

      setWalletData(prev => ({
        ...prev,
        [wallet.id]: {
          nativeBalance,
          hypeOnChain,
          hypeExchange,
          totalHype,
          stakingAmount,
          allBalances,
          withdraws: stateData.withdraws || [],
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
    if (wallets.length === 1) {
      localStorage.removeItem('hyperliquid_wallets');
    }
  };

  const handleUpdateLabel = (id, newLabel) => {
    setWallets(wallets.map(w => 
      w.id === id ? { ...w, label: newLabel || 'Sin etiqueta' } : w
    ));
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
              <p className="text-sm text-slate-400">Wallet & Exchange Monitor</p>
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
                  placeholder="0xcd1a5fb7c3a5ad2a13fce54853b3c3a01396e525"
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
                  placeholder="Ej: Ballena Insider"
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
                  const hasWithdrawals = data?.withdraws?.length > 0;
                  const hasStaking = data?.stakingAmount > 0;
                  
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
                        ) : hasWithdrawals ? (
                          <div className="flex items-center gap-2 text-xs text-yellow-400">
                            <Clock className="w-3 h-3" />
                            Unstaking
                          </div>
                        ) : hasStaking ? (
                          <div className="flex items-center gap-2 text-xs text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Staked
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
                  Añade wallets para monitorear balances on-chain y en el exchange
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
                  loading={loading[wallet.id]}
                  onDelete={handleDeleteWallet}
                  onUpdateLabel={handleUpdateLabel}
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
};

const WalletCard = ({ wallet, data, loading, onDelete, onUpdateLabel }) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editedLabel, setEditedLabel] = useState(wallet.label);

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
          {/* HYPE Balance Summary */}
          {totalHype > 0 && (
            <div className="mb-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg p-4 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold">Balance HYPE</span>
              </div>
              <div className="text-3xl font-bold text-slate-100 mb-3">
                {totalHype.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 rounded p-2">
                  <p className="text-xs text-slate-500">On-Chain</p>
                  <p className="text-sm font-mono text-emerald-400">
                    {hypeOnChain.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded p-2">
                  <p className="text-xs text-slate-500">Exchange</p>
                  <p className="text-sm font-mono text-blue-400">
                    {hypeExchange.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Staking */}
          {stakingAmount > 0 && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-emerald-300">Staking</span>
                <span className="text-sm font-mono font-semibold text-emerald-400">
                  {stakingAmount.toLocaleString()} USD
                </span>
              </div>
            </div>
          )}

          {/* Pending Withdrawals */}
          {withdraws.length > 0 && (
            <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-300">
                  {withdraws.length} Retiro{withdraws.length > 1 ? 's' : ''} Pendiente{withdraws.length > 1 ? 's' : ''}
                </span>
              </div>
              {withdraws.map((w, idx) => (
                <div key={idx} className="text-xs text-yellow-200">
                  {parseFloat(w.amount).toLocaleString()} USD
                </div>
              ))}
            </div>
          )}

          {/* All Balances */}
          {allBalances.length > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium">Todos los Balances</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
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

          {/* Actions */}
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
};

export default HyperliquidDashboard;
