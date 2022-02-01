// file: early-stock-trader.js

// does not require 4s Market Data TIX API Access

// defines if stocks can be shorted (see BitNode 8)
const shortAvailable = true;

const commission = 100000;
const samplingLength = 30;

function predictState(samples) {
  const limits = [null, null, null, null, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 12, 12, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 19, 19, 20];
  let inc = 0;
  for (let i = 0; i < samples.length; ++i) {
    const total = i + 1;
    const idx = samples.length - total;
    if (samples[idx] > 1.) {
      ++inc;
    }
    const limit = limits[i];
    if (limit === null) {
      continue;
    }
    if (inc >= limit) {
      return 1;
    }
    if ((total - inc) >= limit) {
      return -1;
    }
  }
  return 0;
}

function format(money) {
  const prefixes = ["", "k", "m", "b", "t", "q"];
  for (let i = 0; i < prefixes.length; i++) {
    if (Math.abs(money) < 1000) {
      return `${Math.floor(money * 10) / 10}${prefixes[i]}`;
    } else {
      money /= 1000;
    }
  }
  return `${Math.floor(money * 10) / 10}${prefixes[prefixes.length - 1]}`;
}

function posNegDiff(samples) {
  const pos = samples.reduce((acc, curr) => acc + (curr > 1. ? 1 : 0), 0);
  return Math.abs(samples.length - 2 * pos);
}

function posNegRatio(samples) {
  const pos = samples.reduce((acc, curr) => acc + (curr > 1. ? 1 : 0), 0);
  return Math.round(100 * (2 * pos / samples.length - 1));
}

export async function main(ns) {
  ns.disableLog("ALL");
  let symLastPrice = {};
  let symChanges = {};
  for (const sym of ns.stock.getSymbols()) {
    symLastPrice[sym] = ns.stock.getPrice(sym);
    symChanges[sym] = []
  }

  while (true) {
    await ns.sleep(2000);

    if (symLastPrice['FSIG'] === ns.stock.getPrice('FSIG')) {
      continue;
    }

    var longStocks = new Set();
    var shortStocks = new Set();

    for (const sym of ns.stock.getSymbols()) {
      const current = ns.stock.getPrice(sym);
      symChanges[sym].push(current / symLastPrice[sym]);
      symLastPrice[sym] = current;
      if (symChanges[sym].length > samplingLength) {
        symChanges[sym] = symChanges[sym].slice(symChanges[sym].length - samplingLength);
      }
    }

    const prioritizedSymbols = [...ns.stock.getSymbols()];
    prioritizedSymbols.sort((a, b) => posNegDiff(symChanges[b]) - posNegDiff(symChanges[a]));

    ns.print("");
    const maxStocksToConsider = 5;
    // only consider the first most profitable stocks for buying
    var stocksConsidered = 0;
    var sold = false;
    for (const sym of prioritizedSymbols) {
      const positions = ns.stock.getPosition(sym);
      const longShares = positions[0];
      const longPrice = positions[1];
      const shortShares = positions[2];
      const shortPrice = positions[3];

      if (longShares <= 0 && shortShares <= 0 && (ns.stock.getPrice(sym) < 20000 || stocksConsidered >= maxStocksToConsider)) {
        continue;
      }
      stocksConsidered++;

      const state = predictState(symChanges[sym]);
      const ratio = posNegRatio(symChanges[sym]);
      const bidPrice = ns.stock.getBidPrice(sym);
      const askPrice = ns.stock.getAskPrice(sym);

      if (longShares > 0) {
        const cost = longShares * longPrice;
        const profit = longShares * (bidPrice - longPrice) - 2 * commission;
        if (state < 0) {
          const sellPrice = ns.stock.sell(sym, longShares);
          if (sellPrice > 0) {
            sold = true;
            ns.print(`INFO SOLD (long) ${sym}. Profit: ${format(profit)}`);
          }
        } else {
          longStocks.add(sym);
          ns.print(`${sym} (${ratio}): ${format(profit + cost)} / ${format(profit)} (${Math.round(profit / cost * 10000) / 100}%)`);
        }
      }
      else if (shortShares > 0) {
        const cost = shortShares * shortPrice;
        const profit = shortShares * (shortPrice - askPrice) - 2 * commission;
        if (state > 0) {
          const sellPrice = ns.stock.sellShort(sym, shortShares);
          if (sellPrice > 0) {
            sold = true;
            ns.print(`INFO SOLD (short) ${sym}. Profit: ${format(profit)}`);
          }
        } else {
          shortStocks.add(sym);
          ns.print(`${sym} (${ratio}): ${format(profit + cost)} / ${format(profit)} (${Math.round(profit / cost * 10000) / 100}%)`);
        }
      }
      else if (state > 0) {
        longStocks.add(sym);
      }
      else if (state < 0) {
        shortStocks.add(sym);
      }
      const money = ns.getServerMoneyAvailable("home");
      if (money > commission * 1000) {
        if (state > 0 && !sold) {
          const sharesToBuy = Math.min(ns.stock.getMaxShares(sym), Math.floor((money - commission) / askPrice));
          if (ns.stock.buy(sym, sharesToBuy) > 0) {
            longStocks.add(sym);
            ns.print(`INFO BOUGHT (long) ${sym}.`);
          }
        } else if (state < 0 && !sold && shortAvailable) {
          const sharesToBuy = Math.min(ns.stock.getMaxShares(sym), Math.floor((money - commission) / bidPrice));
          if (ns.stock.short(sym, sharesToBuy) > 0) {
            shortStocks.add(sym);
            ns.print(`INFO BOUGHT (short) ${sym}.`);
          }
        }

      }
    }

    // send stock market manipulation orders to hack manager
    var growStockPort = ns.getPortHandle(1); // port 1 is grow
    var hackStockPort = ns.getPortHandle(2); // port 2 is hack
    if (growStockPort.empty() && hackStockPort.empty()) {
      // only write to ports if empty
      for (const sym of longStocks) {
        //ns.print("INFO grow " + sym);
        growStockPort.write(getSymServer(sym));
      }
      for (const sym of shortStocks) {
        //ns.print("INFO hack " + sym);
        hackStockPort.write(getSymServer(sym));
      }
    }
    // while manipulating the stock market is nice, the early game effect is negligible
    // since "interesting" stocks can typically not be attacked yet due to low hacking skill 
    // in my experience actively manipulating "low hack skill" stocks is less effective than trading megacorps
    // It has more impact starting mid-game where access to 4s is there (use a trader with 4s data)
    // main use case is the BN8 challenge
  }
}

function getSymServer(sym) {
  const symServer = {
    "WDS": "",
    "ECP": "ecorp",
    "MGCP": "megacorp",
    "BLD": "blade",
    "CLRK": "clarkinc",
    "OMTK": "omnitek",
    "FSIG": "4sigma",
    "KGI": "kuai-gong",
    "DCOMM": "defcomm",
    "VITA": "vitalife",
    "ICRS": "icarus",
    "UNV": "univ-energy",
    "AERO": "aerocorp",
    "SLRS": "solaris",
    "GPH": "global-pharm",
    "NVMD": "nova-med",
    "LXO": "lexo-corp",
    "RHOC": "rho-construction",
    "APHE": "alpha-ent",
    "SYSC": "syscore",
    "CTK": "comptek",
    "NTLK": "netlink",
    "OMGA": "omega-net",
    "JGN": "joesguns",
    "SGC": "sigma-cosmetics",
    "CTYS": "catalyst",
    "MDYN": "microdyne",
    "TITN": "titan-labs",
    "FLCM": "fulcrumtech",
    "STM": "stormtech",
    "HLS": "helios",
    "OMN": "omnia",
    "FNS": "foodnstuff"
  }

  return symServer[sym];

}