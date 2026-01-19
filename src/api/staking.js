export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ error: 'Address required' });
  }

  try {
    // Intentar obtener datos desde hypurrscan
    const url = `https://hypurrscan.io/address/${address}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Buscar "Staked:" en el HTML
    let staked = 0;
    const stakingRegex = /Staked.*?([0-9,]+\.?[0-9]*)\s*<\/dd>/i;
    const stakingMatch = html.match(stakingRegex);
    
    if (stakingMatch) {
      staked = parseFloat(stakingMatch[1].replace(/,/g, ''));
    }

    // Buscar withdrawals
    const withdrawals = [];
    const withdrawalRegex = /Withdrawal.*?([0-9,]+\.?[0-9]*)\s*HYPE/gi;
    const withdrawalMatches = [...html.matchAll(withdrawalRegex)];

    withdrawalMatches.forEach(match => {
      const amount = match[1].replace(/,/g, '');
      // Timestamp aproximado: 4 días atrás por defecto
      const time = (Date.now() - (4 * 24 * 60 * 60 * 1000)).toString();
      
      withdrawals.push({
        amount,
        time
      });
    });

    return res.status(200).json({
      address,
      staked,
      withdrawals
    });

  } catch (error) {
    console.error('Scraping error:', error.message);
    
    // Fallback: retornar 0 en lugar de error
    return res.status(200).json({
      address,
      staked: 0,
      withdrawals: []
    });
  }
}
