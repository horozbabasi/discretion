/**
 * main.ts — entry point: bundled fonts, stylesheet, mount the app.
 * Everything the page needs ships in the bundle; it makes no request to
 * any other host, matching the project's zero-network posture.
 */

import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './style.css';

import { createApp } from './app.js';

const mount = document.getElementById('app');
if (mount === null) throw new Error('missing #app mount point');
createApp(mount);
