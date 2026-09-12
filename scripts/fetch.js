const fs = require('fs');

const SECTOR_LIST = [
  { code: 'BK0447', name: '半导体' },
  { code: 'BK0493', name: '软件服务' },
  { code: 'BK0900', name: '光伏设备' },
  { code: 'BK0428', name: '电力' },
  { code: 'BK0475', name: '银行' },
  { code: 'BK0477', name: '证券' },
  { code: 'BK0438', name: '医药商业' },
  { code: 'BK0465', name: '汽车整车' },
  { code: 'BK0729', name: '航天航空' },
  { code: 'BK0910', name: '专用设备' },
  { code: 'BK0433', name: '食品饮料' },
  { code: 'BK0478', name: '通信设备' }
];

const INDEX_CODES = [
  { code: '1.000001', name: '上证' },
  { code: '0.399001', name: '深证' },
  { code: '0.399006', name: '创业板' }
];

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
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function fetchIndex() {
  const secids = INDEX_CODES.map(x => x.code).join(',');
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?secids=${secids}&fields=f2,f3,f4,f6,f12,f14`;
  try {
    const j = await fetchJSON(url);
    const list = (j.data && j.data.diff) || [];
    const out = {};
    for (const it of list) {
      const name = INDEX_CODES.find(x => x.code.endsWith(it.f12));
      if (!name) continue;
      out[name.name] = {
        code: it.f12,
        name: name.name,
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

async function fetchSectorInfo(sectorCode) {
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=90.${sectorCode}&fields=f43,f44,f45,f46,f47,f48,f60,f170,f104,f105`;
  try {
    const j = await fetchJSON(url);
    if (!j.data) return null;
    const d = j.data;
    return {
      changePct: d.f170 !== undefined ? d.f170 / 100 : 0,
      turnover: d.f48 || 0,
      upCount: d.f104 || 0,
      downCount: d.f105 || 0
    };
  } catch (e) {
    return null;
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

  for (const sec of SECTOR_LIST) {
    console.log('抓取板块:', sec.name);
    const stocks = await fetchSectorStocks(sec.code);
    const info = await fetchSectorInfo(sec.code);
    if (stocks.length === 0) continue;

    const changePct = info ? info.changePct :
      (stocks.reduce((a, b) => a + (b.changePct || 0), 0) / stocks.length);
    const turnover = info ? info.turnover :
      stocks.reduce((a, b) => a + (b.turnover || 0), 0);
    const upCount = info ? info.upCount : stocks.filter(s => s.changePct > 0).length;
    const downCount = info ? info.downCount : stocks.filter(s => s.changePct < 0).length;

    result.sectors.push({
      code: sec.code,
      name: sec.name,
      changePct: Math.round(changePct * 100) / 100,
      turnover: turnover,
      upCount: upCount,
      downCount: downCount,
      leader: stocks[0] ? stocks[0].name : '',
      leaderChangePct: stocks[0] ? stocks[0].changePct : 0,
      mainInflow: stocks.reduce((a, b) => a + (b.mainInflow || 0), 0),
      stocks: stocks.slice(0, 10)
    });
  }

  fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
  console.log('完成! 抓取到 ' + result.sectors.length + ' 个板块');
}

main().catch(e => { console.error(e); process.exit(1); });
