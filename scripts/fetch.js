const fs = require('fs');

function pickStockPool(code) {
  if (!code || typeof code !== 'string') return false;
  const ok = ['600','601','603','605','000','001','002'];
  const bad = ['300','301','688','8','4'];
  for (const b of bad) if (code.startsWith(b)) return false;
  for (const a of ok) if (code.startsWith(a)) return true;
  return false;
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://quote.eastmoney.com/',
      'Accept': '*/*'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function fetchIndex() {
  const secids = '1.000001,0.399001,0.399006';
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f4,f6,f12,f14`;
  try {
    const j = await fetchJSON(url);
    const list = (j.data && j.data.diff) || [];
    const names = { '000001': '上证', '399001': '深证', '399006': '创业板' };
    const out = {};
    for (const it of list) {
      const n = names[it.f12];
      if (!n) continue;
      out[n] = {
        code: it.f12,
        name: n,
        price: it.f2 / 100,
        changePct: it.f3 / 100,
        change: it.f4 / 100,
        turnover: it.f6
      };
    }
    return out;
  } catch (e) {
    console.error('fetchIndex error:', e.message);
    return {};
  }
}

async function fetchTopSectors() {
  const url = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f2,f3,f4,f5,f6,f8,f12,f14,f104,f105,f128,f136,f62';
  try {
    const j = await fetchJSON(url);
    const list = (j.data && j.data.diff) || [];
    return list.map(it => ({
      code: it.f12,
      name: it.f14,
      changePct: it.f3,
      turnover: it.f6,
      upCount: it.f104,
      downCount: it.f105,
      leader: it.f128,
      leaderChangePct: it.f136,
      mainInflow: it.f62
    }));
  } catch (e) {
    console.error('fetchTopSectors error:', e.message);
    return [];
  }
}

async function fetchSectorStocks(sectorCode) {
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=50&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${sectorCode}&fields=f2,f3,f4,f5,f6,f8,f10,f12,f14,f15,f16,f17,f18,f20,f21,f62`;
  try {
    const j = await fetchJSON(url);
    const list = (j.data && j.data.diff) || [];
    return list.map(it => ({
      code: it.f12,
      name: it.f14,
      price: it.f2 / 100,
      changePct: it.f3 / 100,
      change: it.f4 / 100,
      volume: it.f5,
      turnover: it.f6,
      turnoverRate: it.f8 / 100,
      volumeRatio: it.f10 / 100,
      high: it.f15 / 100,
      low: it.f16 / 100,
      open: it.f17 / 100,
      prevClose: it.f18 / 100,
      marketCap: it.f20,
      floatCap: it.f21,
      mainInflow: it.f62
    })).filter(s => pickStockPool(s.code));
  } catch (e) {
    console.error('sector ' + sectorCode + ' error:', e.message);
    return [];
  }
}

async function main() {
  console.log('开始抓取...');
  const result = {
    updatedAt: new Date().toISOString(),
    indices: await fetchIndex(),
    sectors: []
  };

  console.log('抓取指数:', Object.keys(result.indices).join(', '));

  const topSectors = await fetchTopSectors();
  console.log('获取到 ' + topSectors.length + ' 个热门板块');

  for (const sec of topSectors.slice(0, 12)) {
    console.log('抓取板块:', sec.name + ' (' + sec.code + ')');
    const stocks = await fetchSectorStocks(sec.code);
    console.log('  ' + sec.name + ' 抓到 ' + stocks.length + ' 只股票');
    if (stocks.length === 0) continue;

    result.sectors.push({
      code: sec.code,
      name: sec.name,
      changePct: sec.changePct,
      turnover: sec.turnover,
      upCount: sec.upCount,
      downCount: sec.downCount,
      leader: sec.leader,
      leaderChangePct: sec.leaderChangePct,
      mainInflow: sec.mainInflow,
      stocks: stocks.slice(0, 10)
    });
  }

  fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
  console.log('完成! 抓取到 ' + result.sectors.length + ' 个板块');
}

main().catch(e => { console.error(e); process.exit(1); });
