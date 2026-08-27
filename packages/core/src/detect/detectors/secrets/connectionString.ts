/**
 * CONNECTION_STRING — database URIs with embedded credentials.
 *
 * SPEC.md: "database URIs with embedded credentials." The signal is a
 * database scheme plus a password in the userinfo. A scheme with only a
 * username (or none) is a connection string but not a SECRET — it leaks no
 * credential — so it is not emitted here; a bare host:port DSN is likewise
 * out of scope for a credential detector. The whole URI is the span, for the
 * same reason as URL_WITH_CREDENTIALS: a partial mask still leaks the host.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const DB_SCHEMES = new Set([
  'postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'mongodb+srv',
  'redis', 'rediss', 'amqp', 'amqps', 'mssql', 'sqlserver', 'jdbc',
  'cassandra', 'couchbase', 'clickhouse', 'cockroachdb', 'db2', 'oracle',
]);

function isPlaceholder(value: string): boolean {
  if (/^\$\{[^}]*\}$/.test(value) || /^\{\{[^}]*\}\}$/.test(value) || /^<[^>]*>$/.test(value)) return true;
  if (/^(?:x+|\*+|password|passwd|pass|changeme|placeholder)$/i.test(value)) return true;
  if (/^YOUR[_-]/i.test(value)) return true;
  return false;
}

function validateConnectionString(ctx: ValidationContext): ValidationResult {
  const raw = ctx.match[0];
  const schemeEnd = raw.indexOf('://');
  if (schemeEnd < 0) return invalid('no scheme');
  const scheme = raw.slice(0, schemeEnd).toLowerCase();
  if (!DB_SCHEMES.has(scheme)) return invalid('not a database scheme');

  const rest = raw.slice(schemeEnd + 3);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd);
  const at = authority.lastIndexOf('@');
  if (at <= 0) return invalid('no userinfo credential');
  const userinfo = authority.slice(0, at);
  const colon = userinfo.indexOf(':');
  if (colon <= 0 || colon === userinfo.length - 1) return invalid('userinfo carries no password');

  const password = userinfo.slice(colon + 1);
  const host = authority.slice(at + 1);
  const placeholder = isPlaceholder(password);

  return valid({
    canonical: raw,
    sensitive: !placeholder,
    metadata: { scheme, host },
    validator: 'connection-string',
  });
}

registerDetector({
  id: 'connection-string',
  entityType: 'CONNECTION_STRING',
  regions: [GLOBAL_REGION],
  // Commas and pipes terminate the URI, for the reason recorded on the
  // credentialled-URL detector: in CSV rows and pipe-delimited logs they are
  // field boundaries, and an over-long span makes masking overwrite the
  // user's adjacent cells. `;` is deliberately NOT excluded — a JDBC
  // connection string carries its properties after one, and cutting there
  // would truncate the credential this detector exists to find.
  pattern: /\b[a-zA-Z][a-zA-Z0-9+]*:\/\/[^\s"'<>,|]*:[^\s"'<>,|@]*@[^\s"'<>,|]{2,300}/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Database connection URIs carrying a password in userinfo; whole-URI span.',
  validate: validateConnectionString,
});
