/**
 * Minimal structured logging helper (console + optional spans).
 */
function fmt(args) {
  return args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
}

const logger = {
  info: (...args) => console.log(`[${new Date().toISOString()}] INFO  ${fmt(args)}`),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN  ${fmt(args)}`),
  error: (...args) => console.error(`[${new Date().toISOString()}] ERROR ${fmt(args)}`),
};

module.exports = { logger };