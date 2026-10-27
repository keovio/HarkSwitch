const $ = s => document.querySelector(s);

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

const fmt = ts => {
  const d = new Date(ts);
  return `保存于 ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

async function render() {
  const { accounts, activeId } = await HS.load();
  const ul = $("#list"); ul.innerHTML = "";
  $("#empty").hidden = accounts.length > 0;
  for (const a of accounts) {
    const li = document.createElement("li");
    if (a.id === activeId) li.className = "active";
    li.innerHTML = `<span class="dot"></span>
      <div class="info"><div class="name"></div><div class="meta">${fmt(a.savedAt)}</div></div>
      <div class="ops"><button data-op="rename" title="改名">改名</button><button data-op="remove" title="删除">删除</button></div>`;
    li.querySelector(".name").textContent = a.name;
    li.addEventListener("click", async e => {
      const op = e.target.dataset.op;
      if (op === "rename") {
        const n = prompt("新的备注名", a.name);
        if (n && n.trim()) { await HS.rename(a.id, n.trim()); render(); }
        return;
      }
      if (op === "remove") {
        if (confirm(`删除「${a.name}」？只删本地保存的登录状态，不影响账号本身。`)) { await HS.remove(a.id); render(); }
        return;
      }
      if (a.id === activeId) return toast("已经是这个账号了");
      await HS.switchTo(a.id);
      toast(`已切换到「${a.name}」`);
      render();
    });
    ul.appendChild(li);
  }
}

$("#save").addEventListener("click", async () => {
  const { accounts } = await HS.load();
  const name = prompt("给这个账号起个备注名", `账号 ${accounts.length + 1}`);
  if (!name || !name.trim()) return;
  try { await HS.saveCurrent(name.trim()); toast("已保存"); render(); }
  catch (e) { toast(e.message); }
});

$("#add").addEventListener("click", async () => {
  const { activeId } = await HS.load();
  if (!activeId && !confirm("当前登录的账号还没保存，继续会退出它。确定继续？")) return;
  await HS.loginNew();
  toast("已退出，请在网页登录新账号，然后点「保存当前账号」");
  render();
});

render();
