// Injected on each click on the extension's icon: the bookmarklet's toggle, with the icon's words.
import { toggle } from '../main.js';
import { EXTENSION_TEXT } from '../text.js';

toggle(window, EXTENSION_TEXT);
