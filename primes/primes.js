// Fastest correct prime counter: prints pi(N), the count of primes <= N,
// for N read from stdin (1 <= N <= 5,000,000). Run: node primes.js
//
// Method: odd-only sieve of Eratosthenes on a Uint8Array (one byte per odd
// candidate, evens and 1 handled implicitly). Marking starts at p*p and
// steps 2p so each composite is touched as rarely as a plain sieve allows.
const n = +require("fs").readFileSync(0, "utf8");
if (n < 2) { console.log(0); process.exit(0); }
const half = (n >> 1) + 1;
const comp = new Uint8Array(half); // comp[i] marks 2i+1
const lim = Math.floor(Math.sqrt(n));
for (let p = 3; p <= lim; p += 2) {
  if (comp[p >> 1]) continue;
  const step = p << 1;
  for (let j = p * p; j <= n; j += step) comp[j >> 1] = 1;
}
let count = 1; // the prime 2
for (let i = 3; i <= n; i += 2) if (!comp[i >> 1]) count++;
console.log(count);
