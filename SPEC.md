# PrivacyShield — Specification

## What it is
A Chrome extension (Manifest V3) that protects sensitive data when people use ChatGPT, Claude, and Gemini in their browser. It detects sensitive information in outgoing text, substitutes it with realistic format-preserving surrogates, sends only sanitized text, and restores the original values in the response as it streams in. Everything runs locally. Zero outbound network requests at runtime. The engine underneath (packages/core) is additionally published post-launch as a standalone npm library (M12); the extension is one consumer of it, not its definition.

Users are ordinary people worldwide: freelancers pasting client contracts, developers pasting code containing credentials, people pasting medical results, bank statements, legal documents, or emails containing third parties' information. It works with their existing free accounts. No API key, no signup, no cost.

## Quality bar
This is intended for public release on the Chrome Web Store and for real daily use. It is not a demo.
- Detection accuracy is MEASURED and published, never asserted.
- The system is GLOBAL by design. No single country, language, or script is privileged. Identifier validation, name recognition, and phone/address handling must work across scripts, languages, and jurisdictions with comparable quality.
- False positives are treated as severely as false negatives. Over-masking destroys answer quality and drives uninstalls.
- PACKAGE SIZE IS NOT A CONSTRAINT. Reliability comes first. When accuracy and size conflict, choose accuracy, even if the more accurate option is several times larger. Do not quantize, prune, or downscale a model to save space unless the eval harness shows the quality cost is negligible. The only size ceiling is the Chrome Web Store's published package limit — verify the current limit during M6 and treat it as the sole boundary. Runtime latency IS still a constraint; see the performance budgets.
- Every architectural decision that trades accuracy, latency, or complexity must be documented in ARCHITECTURE.md with the reasoning and the measured numbers behind it.
- packages/core is designed for standalone publication as an npm library. Its public API is a supported product surface: no extension- or playground-specific concepts may leak into core's exports, breaking changes are deliberate decisions, and everything exported must be documented. The extension is one consumer of the library, not its definition.

## Non-negotiable constraints
1. ZERO RUNTIME NETWORK ACCESS. No outbound request of any kind after install: no analytics, telemetry, crash reporting, remote config, model downloads, or CDN fetches. Every dependency, model, and dataset is bundled at build time. host_permissions is exactly chatgpt.com, claude.ai, gemini.google.com and nothing else. This is the entire basis of user trust; it must be literally true and verifiable by reading the source.
2. FAIL CLOSED. If detection errors, exceeds its time budget, the model fails to load, or a site adapter cannot locate its elements, BLOCK the send and tell the user protection is unavailable. Never let an unprotected send proceed silently. Fail-open is a critical bug.
3. NO PLAINTEXT PERSISTENCE. Original values live in memory only, scoped to the tab session, cleared on navigation away and on browser close. chrome.storage.session only if storage is required. Never storage.local, localStorage, or IndexedDB for sensitive values. Never write originals to console, even in debug builds.
4. NO STUBS. Every function fully implemented. No TODO comments, no placeholder returns, no "left as an exercise".
5. MEASURED ACCURACY. No detector ships without eval coverage. The README publishes precision, recall, and F1 per entity type and per language from the eval harness.

## Monorepo
npm workspaces. TypeScript strict throughout: no `any`, strictNullChecks, noUncheckedIndexedAccess, exactOptionalPropertyTypes.

privacyshield/
  packages/
    core/        Detection, substitution, and restoration engine. Zero DOM dependencies. Published standalone to npm after launch (M12).
    data/        Bundled gazetteers, validator tables, surrogate pools, confusables map, trigger lexicons.
    eval/        Labeled corpus generator + benchmark harness. Gates every change to core.
    extension/   Chrome MV3 extension.
    web/         Standalone playground. Demo and landing page.

Tooling: Vite, @crxjs/vite-plugin, Vitest, fast-check for property tests, ESLint, Prettier.

===========================================================
PACKAGE: core
===========================================================

Detection runs as a pipeline. Each stage produces scored candidates; a fusion stage resolves them into final entities. Every stage is independently testable.

--- Stage 0: Normalization ---
Runs before all detection. Users and adversaries both obfuscate, usually unintentionally (copy-paste artifacts, rich text, non-ASCII lookalikes).
- Unicode NFKC normalization
- Strip zero-width and bidi control characters (U+200B–U+200F, U+202A–U+202E, U+FEFF), EXCEPT preserve U+200C ZERO WIDTH NON-JOINER when it sits between letters of a script that uses it meaningfully (Arabic, Persian, Urdu, Devanagari, Bengali, Gurmukhi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Sinhala), since it is linguistically load-bearing there and stripping it corrupts the text
- Homoglyph folding via a bundled Unicode confusables table (Cyrillic а → Latin a, Greek ο → Latin o, fullwidth forms → ASCII), applied SELECTIVELY: fold a character only when it is script-anomalous within its own token (its script differs from the token's dominant script and a confusable mapping exists into that dominant script). Never fold a character that belongs to its token's dominant script. No folding on a dominant-script tie. When computing a token's dominant script, treat Han/Hiragana/Katakana/Latin as one compatible group, and Han/Hangul as one compatible group, so ordinary Japanese and Korean text is never treated as anomalous mixing.
- Collapse whitespace variants; normalize dash and quote variants
- Detect and record the dominant script(s) present (Latin, Cyrillic, Arabic, Hebrew, Han, Kana, Hangul, Devanagari, Greek, Thai, Armenian, Georgian, Ethiopic) — downstream stages branch on this
- CRITICAL: maintain an exact bidirectional offset map from normalized text back to original text. Detection runs on normalized text; substitution applies to original spans. An off-by-one here silently corrupts user text. Property-test this mapping exhaustively.
- Re-run NFKC after folding if any fold fired, so a folded base character followed by a combining mark composes the same way native text would, keeping the pipeline idempotent.

--- Stage 1: Validated identifier detection ---
Regex is only the candidate generator. Emission at high confidence requires passing a validator. A pattern match without validation is at most low confidence.

Structure this as a registry: each detector declares its id, entity type, supported regions, candidate pattern, validator function, and base confidence. Adding a new national identifier must require touching exactly one new file.

Contact and network:
- EMAIL — structural validation, IDN/punycode aware, reject reserved example domains at high confidence
- PHONE — use libphonenumber-js with the full metadata bundle, not the minimal one. Never hand-roll phone regex. Parse and validate, with region inference from surrounding text and a user-set default region. Support all international formats.
- IP_ADDRESS — v4 and v6 with valid-range checking; private/reserved ranges classified separately and lower sensitivity by default
- MAC_ADDRESS
- URL_WITH_CREDENTIALS — userinfo components or tokens in query parameters

Financial:
- CREDIT_CARD — Luhn required, plus issuer BIN range identification (Visa, Mastercard, Amex, Discover, JCB, UnionPay, Diners, Maestro, Troy, Mir, RuPay, Elo, Verve). Known test card numbers matched but classified as non-sensitive.
- IBAN — mod-97 checksum plus per-country length and structure table covering all IBAN-registry countries
- SWIFT_BIC — structural validation against country and location code rules
- US_ROUTING_NUMBER — ABA checksum
- UK_SORT_CODE, CA_TRANSIT_NUMBER, AU_BSB, IN_IFSC, BR_AGENCIA
- CRYPTO_WALLET — BTC base58check and bech32 both validated, ETH with EIP-55 mixed-case checksum where present, plus XMR, LTC, SOL, TRX, ADA, DOT formats

National identifiers — implement with full checksum validation, not pattern matching. Cover at minimum:
- US: SSN (invalid area/group/serial ranges rejected), ITIN, EIN
- Canada: SIN (Luhn)
- UK: National Insurance Number (prefix validity rules), NHS Number (mod 11)
- Ireland: PPS Number
- Germany: Steuer-ID (mod 11 variant), Personalausweis
- France: INSEE/NIR (mod 97 key)
- Spain: DNI and NIE (letter check), CIF
- Italy: Codice Fiscale (full CIN algorithm)
- Netherlands: BSN (11-proef)
- Belgium: Rijksregisternummer (mod 97)
- Poland: PESEL, NIP, REGON
- Sweden: Personnummer (Luhn), Norway: Fødselsnummer (dual mod 11), Denmark: CPR, Finland: HETU, Iceland: Kennitala
- Portugal: NIF (mod 11), Greece: AFM, Czechia: Rodné číslo, Slovakia, Hungary, Romania: CNP, Bulgaria: EGN, Croatia: OIB, Slovenia: EMŠO
- Turkey: TCKN (11 digits, first non-zero, ((d1+d3+d5+d7+d9)×7 − (d2+d4+d6+d8)) mod 10 == d10, sum(d1..d10) mod 10 == d11) and VKN
- Russia: INN, SNILS (mod 101), Ukraine: RNOKPP, Kazakhstan: IIN
- India: Aadhaar (Verhoeff), PAN (structural + checksum), Pakistan: CNIC, Bangladesh: NID
- China: Resident Identity Card (ISO 7064 MOD 11-2), Taiwan: National ID
- Japan: My Number (mod 11), Korea: RRN
- Singapore: NRIC/FIN (weighted checksum), Hong Kong: HKID, Malaysia: MyKad, Indonesia: NIK, Thailand: National ID, Vietnam: CCCD, Philippines: PhilSys
- Australia: TFN (mod 11), Medicare (weighted), ABN (mod 89), New Zealand: IRD Number
- Brazil: CPF and CNPJ (mod 11), Mexico: CURP and RFC, Argentina: DNI and CUIT, Chile: RUT (mod 11), Colombia: NIT, Peru: DNI
- South Africa: ID Number (Luhn + date validity), Nigeria: NIN, Kenya: National ID, Egypt: National ID, Morocco: CNIE
- Israel: Teudat Zehut (Luhn variant)
- Saudi Arabia, UAE, Qatar, Kuwait: national ID formats
- EU VAT numbers — per-country structure and checksum for all member states

Documents and health:
- PASSPORT_MRZ — machine-readable zone lines (TD1, TD2, TD3) with their check digits. MRZ is highly reliable to detect because every field is checksummed; treat a valid MRZ as maximum confidence.
- DRIVERS_LICENSE — per-jurisdiction formats where a validator exists, low confidence otherwise
- VIN — ISO 3779 check digit
- US_NPI — Luhn with prefix
- ICD_10 / ICD_11 codes, SNOMED codes, and common lab-result patterns (with units and reference ranges) — classify as HEALTH_DATA, off by default, on in Strict profile

Secrets and credentials (highest priority for developer users):
- Known-prefix tokens: OpenAI (sk-, sk-proj-), Anthropic (sk-ant-), Google (AIza), GitHub (ghp_, gho_, ghs_, github_pat_), GitLab (glpat-), AWS (AKIA, ASIA), Slack (xoxb-, xoxp-, xoxa-), Stripe (sk_live_, pk_live_, rk_live_), SendGrid (SG.), Twilio (SK), npm (npm_), HuggingFace (hf_), Shopify, Square, Mailgun, Datadog, and PEM private key blocks. Maintain this as a data file so new providers can be added without code changes.
- JWT — structural validation: three base64url segments, header decodes to valid JSON with an alg field
- GENERIC_SECRET — high-entropy strings. Require a Shannon entropy threshold AND an assignment-context signal (see Stage 3) so that "your-api-key-here", "xxxxxxxxxxxx", UUIDs, git SHAs, and base64 image data do not trigger. Tune the threshold empirically against the eval corpus; document the chosen value and the precision/recall curve that justified it.
- CONNECTION_STRING — database URIs with embedded credentials

Location:
- POSTAL_CODE — per-country format table covering all countries with postal systems, low base confidence, requires context boost
- STREET_ADDRESS — multilingual heuristics across address conventions (Western, East Asian reverse-order, Arabic), low base confidence, requires context boost
- COORDINATES — lat/long pairs in decimal and DMS

--- Stage 2: Multilingual named entity recognition ---
For PERSON, ORG, and LOCATION, which patterns fundamentally cannot detect. This stage determines the product's real-world quality more than any other, and package size must not be traded against it.

- Transformers.js running an ONNX token-classification model in a dedicated Web Worker so the UI thread never blocks.
- MODEL SELECTION IS EMPIRICAL AND ACCURACY-FIRST. Benchmark at least four candidate multilingual NER models against the eval corpus. Select on measured F1 across languages and scripts. Do NOT select on size, and do not use F1-per-megabyte as the criterion. If a larger or less-quantized model measurably improves accuracy, choose it. Evaluate fp16 and unquantized variants alongside int8; only quantize if the eval shows the quality loss is negligible.
- Requirements: genuine multilingual coverage including non-Latin scripts, permissive license, ONNX-exportable, runnable in Transformers.js. Xenova's ONNX conversions on HuggingFace are the conventional source; other permissively licensed conversions are equally acceptable.
- Consider an ENSEMBLE of two models with different architectures or training data if the eval shows it improves F1 meaningfully. Report the latency cost alongside the accuracy gain and let the measured numbers decide.
- Verify the current Chrome Web Store package size limit before finalizing the choice. That limit is the only size boundary.
- BUNDLE the model. Runtime download would break the zero-network guarantee.
- Correct subword token merging with exact character offsets. Test explicitly across scripts: Latin with diacritics, Cyrillic, Arabic (RTL), Hebrew (RTL), Han (no word boundaries), Kana, Hangul, Devanagari, Thai.
- Hard timeout with fail-closed behaviour on exceed.
- Load and warm the model at content-script init, not on first send, so the first interaction is not slow.
- Report per-language F1 in the README. Name explicitly which languages and scripts perform worst.

--- Stage 2b: Gazetteers ---
Bundled compressed lookup sets, checked in parallel with the model. Since size is not a constraint, prefer breadth of coverage over compactness.
- Given names and surnames across all major world regions and scripts, from permissively licensed public datasets. Aim for genuinely global coverage, not an English-centric list with a few additions.
- World cities, administrative regions, and countries (GeoNames-derived, CC-BY), including local-language and transliterated name variants
- Global company and brand names
- Medical, legal, and financial terminology used for context scoring, per language
Store as compressed sets or a succinct data structure. Document the size cost of each dataset. Gazetteer hit alone is medium confidence; gazetteer plus model agreement is high.

--- Stage 2c: Verification pass --- REMOVED AT M7, ON ITS OWN CRITERION ---
THIS STAGE DOES NOT EXIST IN THE PIPELINE. It was specified below, built at
M7, measured, and removed under the final clause of its own specification.
Retained here as the record of a settled decision; see ARCHITECTURE.md D20 and
the BENCHMARKS.md M7 section for the parameters and the numbers.

Measured over 861 documents, verification on versus off: PERSON, ORG and
LOCATION precision, recall and false-positive counts were IDENTICAL to the
candidate, while 1.28% of candidates entered the band (45 of 3,505) at +10.5%
wall-clock. The reason is structural rather than a tuning failure: the stage
only ADJUSTS confidence and never suppresses, while the eval scores every
emitted prediction regardless of confidence, so a pure confidence adjustment
is invisible to it by construction. It is not measurable until Stage 4 applies
profile thresholds and confidence begins deciding what is emitted.

Reinstating it is therefore an M8 decision to be made against a THRESHOLDED
eval, not a default. Do not re-add it to the pipeline on the strength of the
specification text below alone.

The original specification, for reference:
- Because compute and size budget are available, borderline candidates get a second look rather than being decided by a single score.
- Candidates whose fused confidence falls in an ambiguous band (tune the band empirically) are re-checked by an independent method: a second model with different training data, a targeted classification prompt against a small bundled model, or a rule-based cross-check, whichever the eval shows performs best.
- Only the ambiguous band is verified, so latency stays bounded. Measure and report what fraction of candidates enter verification and what it costs.
- Report the precision improvement this stage delivers. If the eval shows it does not improve results, remove it and document why.

--- Stage 3: Context scoring ---
This is where false positives die, and the most important stage for real-world quality.

Each candidate's confidence is adjusted by evidence from its surroundings:
- TRIGGER PROXIMITY — labels near the candidate, across many languages ("SSN", "passport no", "diagnosis", "my name is", "IBAN", "kimlik", "Personalausweis", "护照", "паспорт", "पासपोर्ट", and so on). Maintain the trigger lexicon as per-language data files, not inline code, so contributors can extend it. Cover at minimum the twenty most-spoken languages.
- STRUCTURAL CUES — key names in JSON/YAML, CSV column headers, form labels, markdown table headers, .env variable names. A value under a key named "api_key" or "ssn" is near-certain regardless of its shape.
- NEGATIVE CONTEXT — signals that a candidate is NOT sensitive: inside a code comment describing a format, in a documentation example block, a known dummy value, lorem ipsum, a test fixture, a UUID in a log line, a git SHA. These must actively suppress.
- DOCUMENT TYPE — detect whether input is prose, source code (and which language), JSON, YAML, CSV, a log dump, a markdown table, or an email thread. Each mode shifts weights. Code mode raises secret sensitivity and lowers person-name sensitivity, since identifiers in code are usually not people.
- CO-OCCURRENCE — several candidates of complementary types near each other (name, then address, then phone) mutually reinforce; that shape is a contact record.
- REPETITION — a string appearing many times in a technical document is more likely a variable than a person.

--- Stage 4: Fusion, calibration, and resolution ---
- Combine scores from all stages into a single calibrated confidence per candidate. Calibrate against the eval corpus so that a confidence of 0.8 empirically means roughly 80% precision. Document the calibration method and the resulting reliability curve.
- Every emitted entity carries an EXPLANATION: which stages fired, which triggers were found, which validator passed. This drives the review UI and makes failures diagnosable.
- Resolve overlapping candidates: prefer the more specific type, then higher calibrated confidence, then longer span. Never emit overlapping entities.
- Apply the active SENSITIVITY PROFILE, which sets thresholds:
  - Minimal — secrets and financial identifiers only. For developers who want surgical protection.
  - Balanced — default. Secrets, financial, national IDs, contact details, person names.
  - Strict — adds health data, addresses, dates of birth, organizations, low-confidence candidates.
  - Custom — per-entity-type threshold control.
- Apply user allowlist (never mask; e.g. their own employer's name) and denylist (always mask; e.g. an internal project codename). Denylist beats everything.

--- Exposure score ---
A document-level, user-facing sensitivity summary, computed in core.
- computeExposure(detectionResult) → an exposure report: an overall score, a per-category breakdown (secrets/credentials, financial, government identity, health, contact, location, personal names), and the top contributing entities.
- EXPLAINABLE BY CONSTRUCTION: a deterministic aggregation of calibrated confidence × category severity weight × per-type factors, and the report decomposes the total into named contributions. A score that cannot show its work is not acceptable.
- Severity weights live in a reviewed data file in packages/data with documented per-category rationale (a validated credit card outweighs a city name) — never constants buried in code.
- Depends on Stage 4 calibrated confidence, so it is an M8 deliverable. No uncalibrated preview ships earlier, for the same honesty reason M3 refused to label raw confidence as calibration.
- Property test required: monotonicity — adding a detected entity never lowers the score; removing one never raises it.
- Surfacing: the playground gains an exposure panel at M8; the extension review panel shows the document score at M9; the popup shows session aggregates at M10; the README documents the model at M11.
- Limitation stated wherever the score is shown: it summarizes detection output, inherits every detection limitation, and a low score is not a guarantee of safety.

--- Substitution: format-preserving surrogates ---
This is the single largest lever on output quality and must be done properly.

Rather than replacing values with bracket tokens like [PERSON_1], substitute a realistic value of the same type and shape. The model then reasons naturally over coherent text instead of over placeholders, which measurably improves answer quality, and it cannot leak the real value because it never sees it.

- PERSON → a plausible name from a bundled surrogate pool, matched to the detected script and, where inferable, the same general naming convention, so "Yuki Tanaka" does not become "Bob Smith" and break the model's contextual reasoning. Maintain per-region surrogate pools.
- EMAIL → a syntactically valid fake email preserving structure
- PHONE → a valid-format number in the same country, drawn from ranges reserved for fiction where such ranges exist
- CREDIT_CARD → a number of the same issuer that passes Luhn
- NATIONAL_ID → a value passing that country's checksum, so downstream validation in the model's reasoning still behaves
- DATE → a shifted date preserving relative ordering across the document (consistent offset per session, so "born 1990, hired 2015" stays fifteen years apart)
- IBAN → valid checksum, same country
- ORG, LOCATION → plausible substitutes of the same kind and region
- SECRET → a same-shape dummy that is clearly non-functional

Requirements:
- CONSISTENT: the same original always maps to the same surrogate within a session, preserving referential integrity so the model can track entities.
- COLLISION-SAFE: before assigning a surrogate, verify the chosen value does not already appear anywhere in the source text or in the existing vault. Retry from the pool on collision. A collision would make restoration ambiguous and corrupt the user's text.
- REVERSIBLE: bidirectional map maintained in the vault.
- FALLBACK: if the surrogate pool is exhausted or a type has no sensible surrogate, fall back to a bracket token, and mark that in the session record.
- The user can switch between surrogate mode (default) and token mode in settings, because some users prefer visibly seeing that masking happened.

--- vault.ts ---
In-memory bidirectional map, scoped per conversation where the site exposes a conversation identifier, otherwise per tab.
- Deterministic and referentially consistent
- Normalized lookup so trivial variants (case, surrounding whitespace) resolve to one entry
- clear() wipes it; called on navigation away and conversation switch
- No method exposes the full plaintext set except the egress guard, which needs it

--- restorer.ts (the unmasker) ---
Restoration runs against a streaming response, which is where naive implementations break.
- Given accumulated response text, replace complete surrogate occurrences with originals.
- STREAMING SAFETY: text arrives in fragments and a surrogate may be split across chunk boundaries. Operate on accumulated text and never replace on a partial match. When the tail of the accumulated text is a prefix of any known surrogate, hold it unrendered until the next chunk resolves it.
- Handle the model transforming a surrogate: case changes, possessive forms, pluralization, inflection in morphologically rich languages, or translation into another script. Implement a controlled fuzzy fallback with a similarity threshold and a hard rule that ambiguous matches are left alone.
- Unresolvable surrogates remain visible rather than being guessed at.
- Restoration must be idempotent and must never re-process already-restored text.

--- egressGuard.ts ---
The assertion that makes the guarantee real. Before any send is permitted, scan the outgoing payload for every plaintext original in the vault, using normalized comparison so obfuscated forms are caught. Any hit blocks the send and reports which entity leaked. This converts the privacy claim from an intention into a checked invariant.

--- Performance ---
Package size is not a constraint. Runtime latency is.
- Budget: p50 under 250ms and p95 under 600ms for a 2000-character input on a mid-range laptop, excluding model warmup. If a larger model improves accuracy but breaches this, report both numbers and let the measurement drive the decision rather than assuming.
- NER and verification inference in a Web Worker. Pattern and gazetteer stages may run on the main thread if they meet budget; measure and move them if not.
- Model loading and warmup happen at content-script init, in the background, never blocking the first send.
- Incremental detection as the user types, debounced, with results cached by content hash so pressing send is instant.
- Publish measured numbers in the README. If a budget is missed, say so and explain why rather than removing the target.

===========================================================
PACKAGE: eval
===========================================================
Without this the project is guesswork. Build it before tuning any threshold.

- CORPUS GENERATOR: produce labeled synthetic documents combining templates across languages, scripts, and document types (prose, email threads, source code in several languages, JSON, CSV, logs, medical notes, contracts, CVs) with ground-truth entity spans. Generate valid identifiers per country using the same checksum algorithms the validators use, and generate near-miss invalid ones as negatives. Cover at minimum twenty languages across all supported scripts.
- HARD NEGATIVES: this set determines real-world precision. Include documentation with example values, code with placeholder credentials, UUIDs, git SHAs, base64 blobs, version numbers, part numbers, phone-shaped numbers that are not phones, dates, ordinary prose with capitalized non-names, and capitalized common nouns in languages that capitalize differently (German nouns, for instance).
- METRICS: precision, recall, F1, per entity type and per language. Span-level exact match plus partial-overlap match reported separately. Latency distribution. Calibration reliability curve.
- ERROR ANALYSIS: output the worst false positives and false negatives with surrounding context so failures are diagnosable rather than just counted.
- REGRESSION GATES: thresholds per entity type stored in a committed config. CI fails on regression. Run the suite in CI on every change to core.
- Document plainly in the README that the corpus is synthetic, what that means for external validity, and that real-world performance will differ.

===========================================================
PACKAGE: extension
===========================================================

--- manifest.json (MV3) ---
- host_permissions: exactly the three sites
- permissions: storage only
- No externally_connectable, no remote code, no eval, strict CSP
- Permission justifications written out for store review

--- adapters/ ---
Shared SiteAdapter interface:
  matches(url), isReady(), getComposer(), getComposerText(), setComposerText(text),
  onSubmitIntent(cb), getConversationId(), getResponseRoot(), observeResponseStream(cb),
  healthCheck() → { ok, failures[] }

Implement adapters/chatgpt.ts, adapters/claude.ts, adapters/gemini.ts.

SELECTOR RESILIENCE IS THE HIGHEST-RISK AREA. These sites change frequently. For every element define an ordered strategy list: stable attributes first (data-testid, role, aria-label, contenteditable), then structural heuristics, then class names last. healthCheck() runs at init and periodically. On failure the extension enters a visible degraded state, blocks sends, and tells the user the site layout changed. Silent failure is the worst possible outcome and must be impossible by construction.

--- content script flow ---
1. Identify site, load adapter, run healthCheck, warm the NER worker
2. Intercept submit intent: Enter key, send button click, and keyboard shortcut variants
3. Run detection on composer content
4. Run egress guard on the substituted text; block on any leak
5. REVIEW MODE (default): show a compact panel above the composer listing detections grouped by type, each with its calibrated confidence and its explanation, each individually revertible, plus Send and Cancel. First-run users need to see it work.
6. QUIET MODE (opt-in after the user trusts it): substitute and send directly, with a brief badge showing counts
7. Write substituted text into the composer, allow send
8. Observe the response stream and restore surrogates in the DOM as it arrives
9. Record to an in-memory session log: timestamp, types, counts, confidence distribution. Never values.

PASTE GUARD — detection also runs at paste time, not only at submit. When pasted content contains sensitive entities, show an immediate, dismissible inline notice (e.g. "3 API keys, 1 IBAN in what you just pasted") with a one-tap "mask now" — before the user ever reaches send. Submit-time remains the enforcement gate; paste guard is early warning layered on top. Fail-closed rules are unchanged.

Handle correctly: composer edited after detection, cancel mid-flow, rapid successive sends, SPA navigation, conversation switching, file and image attachments (detect and warn that attachment contents are not protected), regenerate and edit-message flows, and copy-to-clipboard of a restored response.

--- UI ---
- All injected UI inside a shadow DOM so host CSS cannot break it and it cannot break the host
- Respect the host page's light/dark theme
- Full keyboard navigation, ARIA roles, screen-reader tested, visible focus states
- Extension UI internationalized via chrome.i18n with English plus at minimum Spanish, German, French, Portuguese, Turkish, Japanese, Hindi, and Arabic (with RTL layout support) message catalogues
- Popup: per-site toggle, session counts by type, adapter health, sensitivity profile switcher, the session exposure aggregate, Quick Redact, and Local Insights (both below)
- Options: per-entity toggles, sensitivity profile, surrogate vs token mode, allowlist, denylist, custom regex rules with live tester, default phone region, settings export/import, a plain-language explanation of what the extension does and does not protect against

--- Quick Redact (popup) ---
A universal redaction surface in the popup: paste any text → masked version with one-tap copy; paste a reply back within the same popup session → restored. Powered entirely by core and the vault; the playground UI is the reference implementation.
- Works for ANY destination — email, Slack, tickets, forums, anywhere — with zero additional host permissions, deliberately preserving the exactly-three-sites permission claim while making the tool useful everywhere else.
- Same memory-only vault rules apply: closing the popup session clears the mapping, and the UI states this plainly.

--- Local Insights (popup) ---
A local, values-free history: counts of masked entities by category over time (e.g. "this month: 12 secrets, 8 financial"). Never values, never text — counts only, satisfying the no-plaintext-persistence rule by construction. User-resettable.
- Purpose: makes ongoing protection visible instead of silent, which is what sustains daily use.

--- Security of the extension itself ---
- No innerHTML with any untrusted content; construct nodes programmatically
- Pinned dependencies with a committed lockfile; document the supply-chain surface
- Reproducible build documented so a reviewer can verify the published package matches the source
- A SECURITY.md with a vulnerability disclosure process

===========================================================
PACKAGE: web
===========================================================
Single-page playground: input on the left, substituted output on the right, detected entities highlighted with type, calibrated confidence, and explanation on hover, and a live summary panel. Sensitivity profile switcher so visitors can feel the tradeoff. Several realistic loadable examples across languages, scripts, and document types. Runs fully client-side on core. This is the try-before-installing surface and the source of the README's screenshots.

===========================================================
TESTS
===========================================================
- Every validator: valid cases, and above all invalid cases. Wrong checksums must not match.
- Property-based tests (fast-check) for the invariants: normalize/offset-map round trip, mask/restore round trip on arbitrary unicode input, surrogate collision-freedom, idempotency of both directions.
- STREAMING RESTORATION: feed responses one character at a time and assert no partial surrogate is ever wrongly replaced and the final text is exactly correct. Fuzz chunk boundaries. This test protects the most visible failure mode.
- Context scoring: hard-negative suite must stay suppressed.
- Cross-script suite covering every script listed in Stage 0.
- Adapter tests against committed HTML fixture snapshots; never against live sites.
- Performance benchmarks with regression gates.
- Full eval suite wired into CI.

===========================================================
SUPPORTING FILES
===========================================================
- README.md: pitch, problem, demo GIF placeholder, install (store and unpacked), architecture diagram, supported sites, full entity-type table with measured per-type precision and recall, per-language accuracy table, the exact model used with its size and license and why it was chosen, privacy guarantees with instructions for verifying the zero-network claim independently, performance numbers, configuration guide, the exposure score model, Quick Redact, Local Insights, LIMITATIONS, the non-goals with reasoning, roadmap
- BENCHMARKS.md: the accuracy work as a published, readable document — candidate models considered, methodology, per-language results, selection reasoning. Written at M6, extended at M7 and M8 as those stages change the numbers. Rigor is a visible artifact, not just numbers in a README table.
- ARCHITECTURE.md: the pipeline in detail, and the reasoning behind each significant tradeoff
- PRIVACY.md: real privacy policy, required for store submission
- SECURITY.md, CONTRIBUTING.md (including a guide to writing a new site adapter and adding a new national identifier validator), LICENSE (MIT), .gitignore
- Chrome Web Store listing draft with permission justifications

===========================================================
LIMITATIONS TO STATE PLAINLY
===========================================================
- Detection is imperfect. It reduces exposure; it does not eliminate it. Publish the actual recall numbers and let users judge.
- Name recognition quality varies by language and script. Name which perform worst, from the eval results.
- Substitution can change answer quality when the model genuinely needs real values.
- These sites change their interfaces; adapters will break until updated.
- Session mappings are memory-only by design. Reloading loses them and earlier responses stay substituted.
- Attachments, images, and pasted files are not protected.
- The extension is large because accuracy was prioritized over size. State the actual download size.
- Not a certified security product; no compliance guarantees.
- Protects what you send to these sites; does not protect against the sites themselves.

===========================================================
NON-GOALS — DECIDED, NOT OPEN
===========================================================
Recorded so they are never silently relitigated. "Roadmap" means possible later by deliberate decision; "rejected" means permanent.
- Attachment/file scanning: roadmap only — interception is heavy and fragile today; the limitation is stated plainly instead.
- Additional chat sites beyond the three: roadmap only — Quick Redact already covers other destinations without expanding host permissions, and minimal permissions IS the trust claim this product depends on.
- Vault/mapping export: rejected permanently — an unmask file is itself a secret; memory-only is the feature, not a limitation to fix.
- Accounts, sync, or any cloud component: rejected permanently — contradicts the product's core zero-network claim.

===========================================================
EXECUTION — MILESTONES
===========================================================
This is too large for one session. Complete each milestone fully, with its tests passing, before starting the next. End each milestone with a summary of what was built and what was measured.

M1  Monorepo, tooling, types, Stage 0 normalization with exhaustive offset-map property tests
M2  Stage 1 validators — all identifier families, with valid and invalid test vectors for each
M3  eval package: corpus generator, hard negatives, metrics, error analysis. Report baseline numbers for Stage 1 alone.
M4  Vault, surrogate substitution with collision safety, streaming-safe restoration, egress guard. Property and fuzz tests.
M5  packages/web on Stages 0–1 plus substitution. First working end-to-end demo.
M6  Stage 2 NER: benchmark at least four candidate models on accuracy, select accuracy-first, integrate in a Web Worker, report per-language numbers and the size cost. Deliverable: BENCHMARKS.md — candidates considered, methodology, per-language results, selection reasoning.
M7  Stage 2b gazetteers, Stage 2c verification pass, and Stage 3 context scoring. Re-run eval; report the precision improvement on hard negatives. Extend BENCHMARKS.md. [DONE. Stage 2c was built, measured, and REMOVED under its own final clause — see the Stage 2c section above and ARCHITECTURE.md D20. Hard-negative false positives 332 → 190, −42.8%.]
M8  Stage 4 fusion, calibration, explanations, sensitivity profiles. Publish the calibration curve. Exposure score engine in core, its severity-weight data file with documented rationale, tests including the monotonicity property, and the playground exposure panel. Extend BENCHMARKS.md.
M9  Extension: manifest, adapters, content script, review UI, streaming restoration in the DOM. Paste guard; review panel shows the document exposure score.
M10 Popup, options, i18n, accessibility, security hardening. Quick Redact, Local Insights, and the exposure session aggregate in the popup.
M11 Full eval run, performance benchmarks, documentation, store listing draft, production build verified loading unpacked in Chrome. README/docs cover the exposure model, Quick Redact, Local Insights, and all non-goals with reasoning.
M12 Library publication (post-launch, after the extension ships): finalize core's public API surface with explicit exports and no internal leakage; semver from 0.x with a documented policy; generated plus hand-curated API docs; npm publish workflow with provenance; a standalone "using the library" guide with examples fully independent of the extension; a CHANGELOG. Final package name decided at M12 (the PrivacyShield name itself is still an open pre-public question, separate from this). Acceptance test: a developer who has never seen this repo can npm install the package and run detection and masking from the docs alone.

Write clean, strictly typed, thoroughly commented TypeScript. Prefer clarity over cleverness. Where you make a judgement call, record it in ARCHITECTURE.md with the reasoning. At each milestone, show the passing tests and the measured numbers.
