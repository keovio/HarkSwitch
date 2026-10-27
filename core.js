// HarkSwitch core: snapshot / restore Hark login state (cookies + localStorage + sessionStorage).
const HS = (() => {
  const DOMAIN = "hark.com";
  const DEFAULT_URL = "https://hark.com/";

  const cookieUrl = c => `http${c.secure ? "s" : ""}://${c.domain.replace(/^\./, "")}${c.path}`;

  async function getCookies() {
    return chrome.cookies.getAll({ domain: DOMAIN });
  }

  async function clearCookies() {
    const all = await getCookies();
    await Promise.all(all.map(c => chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId })));
  }

  async function setCookies(list) {
    for (const c of list) {
      const d = { url: cookieUrl(c), name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly };
      if (!c.hostOnly) d.domain = c.domain;
      if (c.sameSite && c.sameSite !== "unspecified") d.sameSite = c.sameSite;
      if (!c.session && c.expirationDate) d.expirationDate = c.expirationDate;
      try { await chrome.cookies.set(d); } catch (e) { console.warn("cookie set failed", c.name, e); }
    }
  }

  async function harkTabs() {
    return chrome.tabs.query({ url: ["*://hark.com/*", "*://*.hark.com/*"] });
  }

  // Read storage of every Hark origin that has an open tab.
  async function readStorage(tabs) {
    const out = {};
    for (const t of tabs) {
      const origin = new URL(t.url).origin;
      if (out[origin]) continue;
      try {
        const [r] = await chrome.scripting.executeScript({
          target: { tabId: t.id },
          func: () => ({ local: { ...localStorage }, session: { ...sessionStorage } })
        });
        if (r && r.result) out[origin] = r.result;
      } catch (e) { console.warn("read storage failed", origin, e); }
    }
    return out;
  }

  async function writeStorage(tabs, storage) {
    const done = new Set();
    for (const t of tabs) {
      const origin = new URL(t.url).origin;
      if (done.has(origin)) continue;
      done.add(origin);
      const data = storage[origin] || { local: {}, session: {} };
      try {
        await chrome.scripting.executeScript({
          target: { tabId: t.id },
          args: [data],
          func: d => {
            localStorage.clear(); sessionStorage.clear();
            for (const [k, v] of Object.entries(d.local || {})) localStorage.setItem(k, v);
            for (const [k, v] of Object.entries(d.session || {})) sessionStorage.setItem(k, v);
          }
        });
      } catch (e) { console.warn("write storage failed", origin, e); }
    }
  }

  async function snapshot() {
    const tabs = await harkTabs();
    return { cookies: await getCookies(), storage: await readStorage(tabs), savedAt: Date.now() };
  }

  async function load() {
    const { accounts = [], activeId = null } = await chrome.storage.local.get(["accounts", "activeId"]);
    return { accounts, activeId };
  }
  const persist = (accounts, activeId) => chrome.storage.local.set({ accounts, activeId });

  async function saveCurrent(name) {
    const snap = await snapshot();
    if (!snap.cookies.length && !Object.keys(snap.storage).length) throw new Error("没检测到 Hark 登录状态，请先在网页登录");
    const { accounts } = await load();
    const id = crypto.randomUUID();
    accounts.push({ id, name, ...snap });
    await persist(accounts, id);
    return id;
  }

  // Refresh the active account's snapshot (tokens may have rotated) before leaving it.
  async function refreshActive(accounts, activeId) {
    const a = accounts.find(x => x.id === activeId);
    if (!a) return;
    const snap = await snapshot();
    if (snap.cookies.length) Object.assign(a, snap);
  }

  async function reloadOrOpen(tabs) {
    if (tabs.length) {
      for (const t of tabs) chrome.tabs.reload(t.id);
      chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      chrome.tabs.create({ url: DEFAULT_URL });
    }
  }

  async function switchTo(id) {
    const { accounts, activeId } = await load();
    const target = accounts.find(a => a.id === id);
    if (!target) return;
    if (activeId && activeId !== id) await refreshActive(accounts, activeId);
    const tabs = await harkTabs();
    await clearCookies();
    await setCookies(target.cookies);
    await writeStorage(tabs, target.storage || {});
    await persist(accounts, id);
    await reloadOrOpen(tabs);
  }

  async function loginNew() {
    const { accounts, activeId } = await load();
    if (activeId) await refreshActive(accounts, activeId);
    const tabs = await harkTabs();
    await clearCookies();
    await writeStorage(tabs, {});
    await persist(accounts, null);
    await reloadOrOpen(tabs);
  }

  async function rename(id, name) {
    const { accounts, activeId } = await load();
    const a = accounts.find(x => x.id === id); if (a) a.name = name;
    await persist(accounts, activeId);
  }

  async function remove(id) {
    let { accounts, activeId } = await load();
    accounts = accounts.filter(x => x.id !== id);
    await persist(accounts, activeId === id ? null : activeId);
  }

  return { load, saveCurrent, switchTo, loginNew, rename, remove };
})();
