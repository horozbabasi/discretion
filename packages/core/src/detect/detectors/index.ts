/**
 * Every Stage 1 detector family, loaded for registration side effects.
 * Importing this module (directly or via the package root) populates the
 * registry. One line per family; families grow by batch during M2.
 */
import './contact/index.js';
import './financial/index.js';
import './bankcodes/index.js';
import './crypto/index.js';
import './secrets/index.js';
import './documents/index.js';
import './location/index.js';
import './natid/index.js';
