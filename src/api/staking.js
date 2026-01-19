// api/staking.js
export default async function handler(req, res) {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { address } = req.query;

  if (!address) {
    return res.status(400).json({ error: 'Address required' });
  }

  try {
    // Scrapeamos hypurrscan.io
    const url = `https://hypurrscan.io/address/${address}`;
    const response = await fetch(url);
    const html = await response.text();

    // Buscar datos de staking en el HTML
    const stakingMatch = html.match(/Staked:\s*<\/dt>\s*<dd[^>]*>\s*([0-9,\.]+)/i);
    const withdrawalMatch = html.match(/Withdrawal.*?([0-9,\.]+)\s*HYPE/gi);

    let staked = 0;
    if (stakingMatch) {
      staked = parseFloat(stakingMatch[1].replace(/,/g, ''));
    }

    const withdrawals = [];
    if (withdrawalMatch && withdrawalMatch.length > 0) {
      // Buscar timestamps de withdrawals
      const withdrawalBlocks = html.match(/<div class="withdrawal[^>]*>[\s\S]*?<\/div>/gi) || [];
      
      withdrawalBlocks.forEach((block, idx) => {
        const amountMatch = block.match(/([0-9,\.]+)\s*HYPE/i);
        const timeMatch = block.match(/(\d+)\s*days?\s*ago/i) || block.match(/(\d+)\s*hours?\s*ago/i);
        
        if (amountMatch) {
          let time = Date.now() - (4 * 24 * 60 * 60 * 1000); // Default: 4 días atrás
          
          if (timeMatch) {
            const value = parseInt(timeMatch[1]);
            const unit = timeMatch[0].toLowerCase();
            
            if (unit.includes('day')) {
              time = Date.now() - (value * 24 * 60 * 60 * 1000);
            } else if (unit.includes('hour')) {
              time = Date.now() - (value * 60 * 60 * 1000);
            }
          }
          
          withdrawals.push({
            amount: amountMatch[1].replace(/,/g, ''),
            time: time.toString()
          });
        }
      });
    }

    return res.status(200).json({
      address,
      staked,
      withdrawals
    });

  } catch (error) {
    console.error('Scraping error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch staking data',
      details: error.message 
    });
  }
}
