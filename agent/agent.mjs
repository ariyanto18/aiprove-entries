// aiprove-agent — a small, fully autonomous AIProve arena agent.
//
// Loop (from aiprove.fun/skill.md):
//   1. read skill.md          4. list open bounties
//   2. request a challenge     5. enter each bounty
//   3. sign it (EIP-191)       6. submit predictions where a payload suffices
//
// Identity is the agent's own Ethereum keypair, supplied via env:
//   AGENT_PRIVATE_KEY=0x... node agent.mjs [--enter-only]
//
// Transport note: this host's proxy breaks Node's fetch (undici), so all
// HTTP goes through curl, which is known to work. On an unrestricted host
// the same calls work with plain fetch — the API surface is identical.

import { Wallet } from "ethers";
import { execFileSync } from "node:child_process";

const API = process.env.API_BASE_URL || "https://aiprove.fun";
const HANDLE = process.env.AGENT_HANDLE || "rarime";
const ENTER_ONLY = process.argv.includes("--enter-only");

function http(method, path, { token, body } = {}) {
  const args = ["-s", "-X", method, "-H", "User-Agent: aiprove-agent/1.0"];
  if (token) args.push("-H", `Authorization: Bearer ${token}`);
  if (body !== undefined) {
    args.push("-H", "content-type: application/json", "-d", JSON.stringify(body));
  }
  args.push(`${API}${path}`);
  // The arena occasionally answers 502 with a non-JSON body; retry those.
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const out = execFileSync("curl", args, { encoding: "utf8", timeout: 60000 });
      return JSON.parse(out);
    } catch (e) {
      lastErr = e;
      console.log(`  http ${method} ${path}: attempt ${attempt} failed (${e.message.slice(0, 60)}), retrying`);
      execFileSync("sleep", [String(attempt * 2)]);
    }
  }
  throw lastErr;
}

async function main() {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) throw new Error("AGENT_PRIVATE_KEY env var is required");
  const wallet = new Wallet(key);
  console.log(`agent address: ${wallet.address}`);

  // 1. Read the one file that explains everything.
  const skill = execFileSync("curl", ["-s", `${API}/skill.md`], { encoding: "utf8" });
  console.log(`read skill.md (${skill.length} bytes): ${skill.split("\n")[0]}`);

  // 2-3. Keypair challenge -> sign -> session token.
  const { challenge } = http("GET", `/api/auth/challenge?address=${wallet.address}`);
  const signature = await wallet.signMessage(challenge);
  const session = http("POST", "/api/auth/verify", {
    body: { address: wallet.address, signature },
  });
  if (!session.token) throw new Error(`auth failed: ${JSON.stringify(session)}`);
  console.log("authenticated; session token received");
  const token = session.token;

  // 4. List open bounties.
  const { bounties } = http("GET", "/api/bounties?status=open");
  console.log(`${bounties.length} open bounties`);

  // 5-6. Enter each; submit a grounded prediction where the kind allows.
  for (const b of bounties) {
    const entry = http("POST", `/api/bounties/${b.slug}/enter`, {
      token, body: { handle: HANDLE },
    });
    console.log(`entered ${b.slug}: ${entry.id ? "ok" : JSON.stringify(entry)}`);
    if (ENTER_ONLY) continue;

    const detail = http("GET", `/api/bounties/${b.slug}`);
    if (detail.submitKind !== "prediction") {
      console.log(`  ${b.slug}: kind=${detail.submitKind} — needs a build, skipping auto-submit`);
      continue;
    }
    const prediction = await predictFor(b);
    if (!prediction) continue;
    const sub = http("POST", `/api/bounties/${b.slug}/submit`, {
      token, body: { prediction, handle: HANDLE },
    });
    console.log(`  submitted ${b.slug}: ${JSON.stringify(prediction)} -> ${sub.status || JSON.stringify(sub)}`);
  }

  const me = http("GET", "/api/me", { token });
  console.log(`done. competing in ${me.competing.length}, submissions: ${me.submissions.length}`);
}

// Baseline predictor for the built-in forecast kinds. Deliberately simple
// and honest about it: binaries follow 24h momentum with a hedged
// probability (a confident wrong Brier call costs more than a hedged one);
// value forecasts anchor on the current price.
async function predictFor(bounty) {
  const t = (bounty.title + " " + bounty.brief).toLowerCase();
  try {
    if (t.includes("btc") && t.includes("close higher")) {
      const p = await spot("bitcoin");
      return { answer: p.change24h >= 0 ? "yes" : "no", prob: 0.57 };
    }
    if (t.includes("eth") && t.includes("close higher")) {
      const p = await spot("ethereum");
      return { answer: p.change24h >= 0 ? "yes" : "no", prob: 0.57 };
    }
    if (t.includes("nvda")) {
      const q = await stock("NVDA");
      return { value: Math.round(q.price) };
    }
  } catch (e) {
    console.log(`  predictor skipped for ${bounty.slug}: ${e.message}`);
  }
  return null;
}

async function spot(id) {
  const out = execFileSync("curl", ["-s",
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
    "-H", "User-Agent: aiprove-agent/1.0"], { encoding: "utf8", timeout: 30000 });
  const j = JSON.parse(out)[id];
  return { price: j.usd, change24h: j.usd_24h_change };
}

async function stock(sym) {
  const out = execFileSync("curl", ["-s",
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}`,
    "-H", "User-Agent: Mozilla/5.0"], { encoding: "utf8", timeout: 30000 });
  const meta = JSON.parse(out).chart.result[0].meta;
  return { price: meta.regularMarketPrice };
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
