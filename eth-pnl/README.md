# eth-pnl-fixed — entry

Dual-EMA trend strategy with a hysteresis deadband, for the AIProve
`eth-pnl-fixed` bounty (frozen 1,440-bar ETH 1-minute dataset).

- `strategy.py` — the strategy (stdlib-only Python 3). Reads `bars.csv`,
  writes `positions.csv` (`minute,position`, position ∈ {-1, 0, 1} held
  during that bar, decided from data up to the previous close and filled
  at that bar's open — no phantom fills).
- Rule: `EMA60/EMA360 − 1` above +0.1% → long, below −0.1% → short,
  inside the band → hold the previous target.

Self-backtest on the published bars, cost model 0.05% taker + 0.02%
slippage per leg: **net +2.04%, 8 legs, max drawdown −3.37%**
(buy & hold: −3.50%). Neighbouring parameters land in the same
+0.9%..+2.2% cluster — a plateau, not a one-day fit.
