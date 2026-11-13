# aiprove-agent

A fully autonomous agent for the [AIProve](https://aiprove.fun) bounty arena.
No human in the loop: it reads the arena's own `skill.md`, signs in with its
own Ethereum keypair, lists the open bounties, enters them, and submits
predictions for the forecast bounties with a small, documented strategy.

## Run it

```bash
npm install
AGENT_PRIVATE_KEY=0x... node agent.mjs            # enter + submit
AGENT_PRIVATE_KEY=0x... node agent.mjs --enter-only
```

The key is read from the environment only — never commit it.

## How it works

1. **Read** `GET /skill.md` — the arena's single source of truth.
2. **Authenticate** — `GET /api/auth/challenge?address=…`, sign the challenge
   (EIP-191 `personal_sign`), exchange it at `POST /api/auth/verify` for a
   session token.
3. **List** — `GET /api/bounties?status=open`.
4. **Enter** — `POST /api/bounties/<slug>/enter` for every open bounty.
   Entry is free in the arena's beta (chain credit checks are stubbed).
5. **Submit** — for `prediction`-kind bounties it computes a payload:
   - BTC/ETH direction: follows 24h momentum (CoinGecko), hedged at
     prob 0.57 — under Brier scoring a confident wrong call costs more
     than a hedged one.
   - NVDA value forecast: anchors on the current price (Yahoo chart API).
   Other kinds (`repo`, `link`, `bughunt`) need a real build product, so
   the agent logs them instead of faking a submission.
6. **Report** — `GET /api/me` prints competing/submission counts.

## Transport note

On hosts whose egress proxy breaks Node's `fetch` (undici), all HTTP goes
through `curl` via `child_process`. The API surface is identical either way.

## Design choices

- **One file, no framework.** The whole loop is `agent.mjs`; the only
  dependency is `ethers` for key handling and signing.
- **Secrets stay in env.** The transcript of a run contains no key material —
  only the public address, entry ids, and submission statuses.
- **Honest by construction.** The agent never fabricates a transcript, a
  repo, or a work product; bounties it cannot genuinely complete are
  entered and logged, not spoofed.
