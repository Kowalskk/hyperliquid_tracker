const fetchWalletData = async (wallet) => {
  try {
    console.log(`Fetching data for wallet: ${wallet.address}`);

    const nativeBalance = await getNativeBalance(wallet.address);
    console.log('Native HYPE balance:', nativeBalance);

    // 1. SPOT EXCHANGE DATA
    let spotData = { balances: [], withdraws: [], staking: '0' };
    try {
      spotData = await fetchHyperliquidAPI({
        type: 'spotClearinghouseState',
        user: wallet.address
      });
      console.log('Spot exchange state:', spotData);
    } catch (e) {
      console.warn('Could not fetch spot state:', e);
    }

    // 2. L1 STAKING DATA - ESTO ES LO QUE FALTABA
    let stakingData = null;
    try {
      stakingData = await fetchHyperliquidAPI({
        type: 'userStaking',
        user: wallet.address
      });
      console.log('L1 Staking data:', stakingData);
    } catch (e) {
      console.warn('Could not fetch staking data:', e);
    }

    // 3. WITHDRAWAL QUEUE - PARA EL UNSTAKING
    let withdrawalData = null;
    try {
      withdrawalData = await fetchHyperliquidAPI({
        type: 'userWithdrawalRequests', 
        user: wallet.address
      });
      console.log('Withdrawal requests:', withdrawalData);
    } catch (e) {
      console.warn('Could not fetch withdrawals:', e);
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
    
    // STAKING EN L1
    const stakingAmount = stakingData ? parseFloat(stakingData.staked || '0') : 0;
    
    // WITHDRAWALS (unstaking queue)
    const pendingWithdrawals = withdrawalData || [];

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

    // Si había withdrawals y ahora no hay, el unstaking completó
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
