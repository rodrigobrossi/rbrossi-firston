'use strict';
/**
 * Circuit Breaker Factory — wraps axios calls with opossum
 *
 * States:
 *  CLOSED     — normal operation, calls pass through
 *  OPEN       — downstream failed too many times, calls short-circuit immediately
 *  HALF_OPEN  — probe: one call allowed to test if service recovered
 *
 * AWS equivalent: AWS App Mesh / ALB health checks do similar things in prod.
 * Locally: opossum handles it in-process.
 */
const CircuitBreaker = require('opossum');
const axios          = require('axios');

const DEFAULT_OPTIONS = {
  timeout:             5000,   // call must complete within 5s
  errorThresholdPercentage: 50, // open circuit if >50% of last 10 calls fail
  resetTimeout:       15000,   // try again after 15s in OPEN state
  volumeThreshold:       3,    // minimum 3 calls before statistics matter
  rollingCountTimeout: 10000,  // sliding window = 10s
};

const breakers = new Map();

/**
 * Get (or create) a circuit breaker for a named downstream service.
 * @param {string} name  - service name, e.g. 'contact'
 * @param {object} opts  - override default opossum options
 */
function getBreaker(name, opts = {}) {
  if (breakers.has(name)) return breakers.get(name);

  // The "action" wrapped by the breaker is any axios call we pass in
  const action = async (config) => {
    const res = await axios(config);
    return res.data;
  };

  const cb = new CircuitBreaker(action, { ...DEFAULT_OPTIONS, ...opts, name });

  // ── Event logging ──────────────────────────────────────────
  cb.on('open',     () => console.warn(`[circuit-breaker] ⚡ OPEN     → ${name} — stopping calls`));
  cb.on('halfOpen', () => console.info(`[circuit-breaker] 🔶 HALF-OPEN → ${name} — probing...`));
  cb.on('close',    () => console.info(`[circuit-breaker] ✅ CLOSED   → ${name} — recovered`));
  cb.on('fallback', (result) => console.warn(`[circuit-breaker] 🔁 FALLBACK  → ${name}`, result));
  cb.on('timeout',  () => console.error(`[circuit-breaker] ⏱ TIMEOUT  → ${name}`));

  breakers.set(name, cb);
  return cb;
}

/**
 * Make a protected HTTP call through the circuit breaker.
 * Falls back to { error, circuit_open: true } instead of crashing.
 *
 * @param {string} service - service name
 * @param {object} axiosConfig - { method, url, data, headers, ... }
 * @param {*}      fallbackValue - returned when circuit is OPEN
 */
async function call(service, axiosConfig, fallbackValue = null) {
  const cb = getBreaker(service);

  cb.fallback(() => fallbackValue !== null ? fallbackValue : {
    error: `${service} is temporarily unavailable`,
    circuit_open: true,
    service,
  });

  return cb.fire(axiosConfig);
}

/**
 * Returns health stats for all registered breakers.
 * Exposed at GET /health on the BFF.
 */
function getStats() {
  const stats = {};
  for (const [name, cb] of breakers.entries()) {
    stats[name] = {
      state:     cb.opened ? 'OPEN' : cb.halfOpen ? 'HALF_OPEN' : 'CLOSED',
      enabled:   cb.enabled,
      stats: {
        fires:          cb.stats.fires,
        successes:      cb.stats.successes,
        failures:       cb.stats.failures,
        timeouts:       cb.stats.timeouts,
        fallbacks:      cb.stats.fallbacks,
        rejects:        cb.stats.rejects,
        latencyMean:    Math.round(cb.stats.latencyMean || 0),
      }
    };
  }
  return stats;
}

module.exports = { call, getBreaker, getStats };
