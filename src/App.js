import React, { useState } from 'react';
import { Wallet, Plus, X, RefreshCw, AlertCircle } from 'lucide-react';

const QUICKNODE_RPC = 'https://withered-red-isle.hype-mainnet.quiknode.pro/0427da894d1271966f715dc78fd65eadc08c3571/evm';

const App = () => {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const testRPC = async () => {
    if (!address) {
      setError('Ingresa una dirección primero');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      console.log('Testing RPC with address:', address);

      // Test 1: Balance nativo
      const balanceResponse = await fetch(QUICKNODE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBalance',
          params: [address, 'latest']
        })
      });

      const balanceData = await balanceResponse.json();
      console.log('Balance response:', balanceData);

      if (balanceData.error) {
        throw new Error(balanceData.error.message);
      }

      const balanceWei = balanceData.result;
      const balanceEther = parseInt(balanceWei, 16) / 1e18;

      // Test 2: Hyperliquid API
      let apiData = null;
      try {
        const apiResponse = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'spotClearinghouseState',
            user: address
          })
        });

        if (apiResponse.ok) {
          apiData = await apiResponse.json();
          console.log('API response:', apiData);
        }
      } catch (e) {
        console.log('API not available:', e);
      }

      setResult({
        address,
        nativeBalance: balanceEther,
        apiData: apiData || { message: 'API no disponible' }
      });

    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Wallet className="w-8 h-8 text-blue-500" />
          Hyperliquid Balance Tester
        </h1>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Dirección de Wallet
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0xcd1a5fb7c3a5ad2a13fce54853b3c3a01396e525"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <button
              onClick={testRPC}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed
                text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Probar
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-medium">Error</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 text-slate-200">
                ✅ Resultados
              </h2>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Dirección</p>
                  <p className="text-sm font-mono text-slate-300 break-all">{result.address}</p>
                </div>

                <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 rounded-lg p-4 border border-emerald-500/20">
                  <p className="text-xs text-slate-400 mb-2">Balance On-Chain (Wallet)</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    {result.nativeBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4
                    })} HYPE
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-2">
                    Datos de Hyperliquid API
                  </p>
                  <div className="bg-slate-800 rounded-lg p-4 overflow-auto max-h-96">
                    <pre className="text-xs text-slate-400 font-mono">
                      {JSON.stringify(result.apiData, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                💡 <strong>Abre la consola del navegador (F12)</strong> para ver los logs detallados de las llamadas API
              </p>
            </div>
          </div>
        )}

        {!result && !error && !loading && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <Wallet className="w-16 h-16 mx-auto mb-4 text-slate-700" />
            <p className="text-slate-400">
              Ingresa una dirección de wallet para probar la conexión
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
