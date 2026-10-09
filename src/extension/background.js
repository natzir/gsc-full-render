// The service worker: wires Chrome's events to worker.js. Listeners are added at the top level so
// Chrome finds them when it wakes the worker up.
import { iconClicked, installed, menuClicked, startup } from './worker.js';

const report = error => console.error('[GSC Full Render]', error);

chrome.runtime.onInstalled.addListener(details => installed(details, chrome).catch(report));
chrome.runtime.onStartup.addListener(() => startup(chrome).catch(report));
chrome.contextMenus.onClicked.addListener(info => menuClicked(info, chrome).catch(report));
chrome.action.onClicked.addListener(tab => iconClicked(tab, chrome).catch(report));
