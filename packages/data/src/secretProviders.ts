/**
 * Known-prefix API token providers.
 *
 * SPEC.md: "Maintain this as a data file so new providers can be added
 * without code changes." Adding a provider is one entry here; the single
 * `api-key` detector reads the whole table. Each entry declares the prefix,
 * the body charset and length window after the prefix, and whether the token
 * carries its own checksum.
 *
 * GitHub's modern tokens (ghp_, gho_, ghs_, github_pat_) end in a base62
 * CRC32 check character sequence over the random body; that check is
 * implemented in the detector and flagged here with `checksum: 'github'`.
 * Everything else is prefix + shape, which for these high-entropy,
 * high-specificity prefixes is already a strong signal.
 */

export interface SecretProvider {
  /** Stable id, used in candidate metadata. */
  readonly id: string;
  /** Human label for the review UI. */
  readonly label: string;
  /** Literal prefixes; the longest matching prefix wins. */
  readonly prefixes: readonly string[];
  /** Character class for the token body after the prefix. */
  readonly bodyCharset: 'base62' | 'hex' | 'base64url' | 'alnum';
  /** Inclusive body-length window (characters after the prefix). */
  readonly bodyLength: readonly [min: number, max: number];
  /** Checksum scheme, if the token self-verifies. */
  readonly checksum?: 'github';
}

export const SECRET_PROVIDERS: readonly SecretProvider[] = [
  // OpenAI — legacy sk- and project-scoped sk-proj-. Bodies vary in length
  // across generations, so the window is wide.
  { id: 'openai', label: 'OpenAI API key', prefixes: ['sk-proj-', 'sk-'], bodyCharset: 'base62', bodyLength: [20, 120] },
  // Anthropic — sk-ant- then account and key sections.
  { id: 'anthropic', label: 'Anthropic API key', prefixes: ['sk-ant-'], bodyCharset: 'base64url', bodyLength: [80, 120] },
  // Google API key — AIza + 35 chars, fixed.
  { id: 'google', label: 'Google API key', prefixes: ['AIza'], bodyCharset: 'base64url', bodyLength: [35, 35] },
  // GitHub — CRC32-checked base62 bodies.
  { id: 'github-pat', label: 'GitHub personal access token', prefixes: ['ghp_'], bodyCharset: 'base62', bodyLength: [36, 36], checksum: 'github' },
  { id: 'github-oauth', label: 'GitHub OAuth token', prefixes: ['gho_'], bodyCharset: 'base62', bodyLength: [36, 36], checksum: 'github' },
  { id: 'github-server', label: 'GitHub server token', prefixes: ['ghs_'], bodyCharset: 'base62', bodyLength: [36, 36], checksum: 'github' },
  { id: 'github-fine', label: 'GitHub fine-grained PAT', prefixes: ['github_pat_'], bodyCharset: 'base62', bodyLength: [82, 82], checksum: 'github' },
  // GitLab.
  { id: 'gitlab', label: 'GitLab personal access token', prefixes: ['glpat-'], bodyCharset: 'base64url', bodyLength: [20, 50] },
  // AWS access key ids — AKIA (long-term), ASIA (temporary), then 16 base32.
  { id: 'aws', label: 'AWS access key id', prefixes: ['AKIA', 'ASIA'], bodyCharset: 'alnum', bodyLength: [16, 16] },
  // Slack — xoxb/xoxp/xoxa then dash-separated numeric+hex sections.
  { id: 'slack', label: 'Slack token', prefixes: ['xoxb-', 'xoxp-', 'xoxa-'], bodyCharset: 'base62', bodyLength: [10, 60] },
  // Stripe — live keys only (test keys are non-sensitive; handled in detector).
  { id: 'stripe', label: 'Stripe live key', prefixes: ['sk_live_', 'pk_live_', 'rk_live_'], bodyCharset: 'base62', bodyLength: [16, 99] },
  // SendGrid — SG. then two dot-joined base64url sections.
  { id: 'sendgrid', label: 'SendGrid API key', prefixes: ['SG.'], bodyCharset: 'base64url', bodyLength: [40, 80] },
  // Twilio — SK then 32 hex.
  { id: 'twilio', label: 'Twilio API key SID', prefixes: ['SK'], bodyCharset: 'hex', bodyLength: [32, 32] },
  // npm automation tokens — npm_ then 36 base62.
  { id: 'npm', label: 'npm access token', prefixes: ['npm_'], bodyCharset: 'base62', bodyLength: [36, 36] },
  // Hugging Face — hf_ then ~34 alnum.
  { id: 'huggingface', label: 'Hugging Face token', prefixes: ['hf_'], bodyCharset: 'alnum', bodyLength: [30, 40] },
  // Shopify — shpat_/shpss_/shpca_/shppa_ then 32 hex.
  { id: 'shopify', label: 'Shopify access token', prefixes: ['shpat_', 'shpss_', 'shpca_', 'shppa_'], bodyCharset: 'hex', bodyLength: [32, 32] },
  // Square — production access tokens.
  { id: 'square', label: 'Square access token', prefixes: ['sq0atp-', 'sq0csp-', 'EAAA'], bodyCharset: 'base64url', bodyLength: [22, 60] },
  // Mailgun — key- then 32 hex.
  { id: 'mailgun', label: 'Mailgun API key', prefixes: ['key-'], bodyCharset: 'hex', bodyLength: [32, 32] },
  // Datadog — 32-hex api key is too generic alone; the dd prefix form here.
  { id: 'datadog', label: 'Datadog API key', prefixes: ['dd'], bodyCharset: 'hex', bodyLength: [30, 34] },
];

/** Body-charset regexes, shared by the detector and the test generators. */
export const SECRET_CHARSET_PATTERN: Readonly<Record<SecretProvider['bodyCharset'], RegExp>> = {
  base62: /^[A-Za-z0-9]+$/,
  hex: /^[0-9a-fA-F]+$/,
  base64url: /^[A-Za-z0-9_-]+$/,
  alnum: /^[A-Za-z0-9]+$/,
};
