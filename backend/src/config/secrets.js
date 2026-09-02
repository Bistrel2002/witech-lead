import crypto from 'node:crypto';

/* The secret that signs session tokens.
 *
 * Five call sites used to read `process.env.JWT_SECRET || 'witech-secret'`.
 * That fallback is a hole, not a convenience: it is a fixed string published
 * in every copy of this repository, so a production deploy that forgot the
 * variable would happily sign and accept tokens anyone could forge for any
 * account, silently and with no failure to notice.
 *
 * Production now refuses to start without a real secret. Development gets a
 * random one per process, which costs a developer nothing to obtain and
 * cannot be guessed. It changes on restart, so sessions do not survive one —
 * an acceptable trade for never handing out a known signing key.
 */
let devSecret = null;

export function getJwtSecret() {
  const configured = process.env.JWT_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. Generate one with: openssl rand -hex 32'
    );
  }

  if (!devSecret) {
    devSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '⚠️  JWT_SECRET absent — clé aléatoire générée pour ce démarrage.\n' +
      '   Les sessions ne survivront pas à un redémarrage. Définissez JWT_SECRET\n' +
      '   dans .env pour les conserver : openssl rand -hex 32'
    );
  }
  return devSecret;
}
