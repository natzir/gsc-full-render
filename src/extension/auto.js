// Registered for Search Console pages while the automatic start is on, and injected into the tabs
// that were open when it was turned on. Runs in the page's own world, like the bookmarklet.
import { autoStart } from '../main.js';
import { EXTENSION_TEXT } from '../text.js';

autoStart(window, EXTENSION_TEXT);
