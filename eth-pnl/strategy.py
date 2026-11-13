#!/usr/bin/env python3
"""AIProve eth-pnl-fixed entry — dual-EMA trend strategy with a deadband.

Strategy (one position, unit size, long/short/flat):
  spread = EMA(close, 60) / EMA(close, 360) - 1
  spread > +0.1%  -> target LONG
  spread < -0.1%  -> target SHORT
  inside the band -> keep the previous target (hysteresis)

Why this shape:
  * A single price-vs-EMA cross whipsaws badly on 1-minute bars (measured:
    140+ position legs/day and -9% net on this dataset). A fast/slow EMA
    spread plus a 0.1% deadband cuts that to 8 legs/day.
  * Slow parameters are deliberate. On the published bars every setting in
    the neighbourhood (fast 30-120, slow 240-480, band 0.1-0.2%) lands in
    the same +0.9%..+2.2% net cluster, so the result is a plateau, not a
    spike fitted to this one day — the held-out tail should see the same
    behaviour: ride real trends, sit out chop, pay almost nothing in costs.
  * Execution is at the NEXT bar's open after the signal bar closes, so
    there are no phantom fills.

Self-backtest on the published 1,440 bars (cost model: 0.05% taker fee +
0.02% slippage per leg, charged on every open and close):
  net PnL +2.04%, 8 position legs, max drawdown -3.37%
  (buy & hold over the same bars: -3.50% net; the day fell -3.36%)

Usage:
  python3 strategy.py [bars.csv]   # writes positions.csv, prints summary
  positions.csv: minute,position   position in {-1, 0, 1} held DURING that
  bar (decided from data up to the previous close, filled at this open).
"""
import csv
import sys

FAST, SLOW, BAND = 60, 360, 0.001
FEE, SLIP = 0.0005, 0.0002
COST = FEE + SLIP


def ema(values, period):
    k = 2.0 / (period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def positions_for(closes):
    ef, es = ema(closes, FAST), ema(closes, SLOW)
    target = 0
    out = []
    for i in range(len(closes)):
        if i > 0:
            spread = ef[i - 1] / es[i - 1] - 1
            if spread > BAND:
                target = 1
            elif spread < -BAND:
                target = -1
        out.append(target)
    return out


def backtest(opens, closes, pos):
    pnl, legs, entry, cur = 0.0, 0, None, 0
    curve = []
    for i in range(1, len(closes)):
        want = pos[i]
        if want != cur:
            if cur != 0:
                pnl += cur * (opens[i] / entry - 1) - COST
                legs += 1
            if want != 0:
                entry = opens[i]
                pnl -= COST
                legs += 1
            cur = want
        curve.append(pnl + (cur * (closes[i] / entry - 1) if cur else 0.0))
    if cur:
        pnl += cur * (closes[-1] / entry - 1) - COST
        legs += 1
    peak = mdd = 0.0
    for e in curve:
        peak = max(peak, e)
        mdd = min(mdd, e - peak)
    return pnl, legs, mdd


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "bars.csv"
    with open(path) as f:
        rows = list(csv.DictReader(f))
    opens = [float(r["open"]) for r in rows]
    closes = [float(r["close"]) for r in rows]
    pos = positions_for(closes)
    with open("positions.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["minute", "position"])
        for i, p in enumerate(pos):
            w.writerow([i, p])
    pnl, legs, mdd = backtest(opens, closes, pos)
    print(f"bars={len(rows)} net PnL {pnl * 100:+.2f}%  legs={legs}  "
          f"maxDD {mdd * 100:.2f}%  (cost/leg {COST * 100:.2f}%)")


if __name__ == "__main__":
    main()
