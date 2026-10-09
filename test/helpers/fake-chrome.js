// A stand-in for the parts of `chrome` the service worker uses. It records what it was asked to
// do and, like Chrome, rejects a script id registered twice and pages that refuse injection.
export function fakeChrome({ stored = {}, registered = [], openTabs = [], refuse = [], failRegister = false } = {}) {
  const calls = { created: [], executed: [], queries: [], menus: [] };
  let scripts = [...registered];
  return {
    calls,
    stored,
    get registered() {
      return scripts;
    },
    storage: {
      local: {
        async get(key) {
          return key in stored ? { [key]: stored[key] } : {};
        },
        async set(items) {
          Object.assign(stored, items);
        },
      },
    },
    scripting: {
      async getRegisteredContentScripts({ ids }) {
        return scripts.filter(script => ids.includes(script.id));
      },
      async registerContentScripts(list) {
        if (failRegister) throw new Error('register failed');
        if (list.some(script => scripts.some(existing => existing.id === script.id))) throw new Error('Duplicate script ID');
        scripts.push(...list);
      },
      async unregisterContentScripts({ ids }) {
        scripts = scripts.filter(script => !ids.includes(script.id));
      },
      async executeScript(injection) {
        if (refuse.includes(injection.target.tabId)) throw new Error('Cannot access contents of the page');
        calls.executed.push(injection);
      },
    },
    tabs: {
      async create(props) {
        calls.created.push(props);
      },
      async query(filter) {
        calls.queries.push(filter);
        return openTabs;
      },
    },
    contextMenus: {
      async removeAll() {
        calls.menus.length = 0;
      },
      create(props) {
        calls.menus.push(props);
      },
    },
  };
}
