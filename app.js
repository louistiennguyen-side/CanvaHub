(function () {
  const L = window.HubLib, api = window.HubAPI, cfg = window.HUB_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SRC = { threads: "Threads", tiktok: "TikTok", canva: "Canva" };
  const labelName = (id) => (L.LABELS.find((l) => l.id === id) || {}).name || "";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  function toast(m) {
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m;
    document.body.append(t); setTimeout(() => t.remove(), 2800);
  }

  // ---------------------------------------------------------------- chủ đề sáng tối
  const root = document.documentElement;
  const savedTheme = store.get("hub.theme", null);
  if (savedTheme) root.dataset.theme = savedTheme;
  $("#themeBtn").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store.set("hub.theme", root.dataset.theme);
  });

  // ---------------------------------------------------------------- thumbnail
  const PALETTES = [
    { bgc: "#f3e6d3", fgc: "#4a2a14", c1: "#8a6f5a", c2: "#d8c3a5", cols: ["#c0764a", "#e8b04a", "#5b8a72"] },
    { bgc: "#fde4ec", fgc: "#8a1c4a", c1: "#7e57c2", c2: "#f48fb1", cols: ["#f06292", "#ffd54f", "#4dd0e1", "#9575cd"] },
    { bgc: "#e4e8ff", fgc: "#26307a", c1: "#0b3d4d", c2: "#1aa6b7", cols: ["#3f51b5", "#ff7043", "#26a69a"] },
    { bgc: "#e7f7ec", fgc: "#1f6b3a", c1: "#5b3a29", c2: "#c08552", cols: ["#2e7d32", "#ffb300", "#8e24aa"] },
    { bgc: "#17142b", fgc: "#ffe14d", c1: "#2b1f63", c2: "#d4568a", cols: ["#ffe14d", "#ff6f91", "#7c4dff"] },
    { bgc: "#e0f4f6", fgc: "#0b6b75", c1: "#0e6f7a", c2: "#7bdcb5", cols: ["#00a6b2", "#ff8a65", "#7e57c2"] },
  ];
  const fontsLoaded = new Set();
  function fontFamily(name) {
    if (!name || !/^[A-Za-z0-9 \-]{2,40}$/.test(name)) return null;
    if (!fontsLoaded.has(name)) {
      fontsLoaded.add(name);
      const l = document.createElement("link"); l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+") + "&display=swap";
      document.head.append(l);
    }
    return `'${name}',var(--f-display)`;
  }
  function fallbackThumb(it) {
    const p = PALETTES[hash(it.title || it.url) % PALETTES.length];
    const hgt = { font: 250, element: 230, template: 340, tutorial: 360 }[it.label] + (hash(it.id || it.url) % 5) * 12;
    const style = `aspect-ratio:200/${hgt}`;
    const text = it.title || labelName(it.label);
    if (it.label === "font") {
      const ff = fontFamily(it.detail) || "var(--f-display)";
      return `<div class="thumb t-font" data-fb="1" style="${style};--bgc:${p.bgc};--fgc:${p.fgc};font-family:${ff}"><div class="aa">Aa</div><div class="sample">${esc(it.detail || text)}</div></div>`;
    }
    if (it.label === "element") {
      const cols = p.cols.map((c) => `<i style="--c:${c}"></i>`).join("");
      return `<div class="thumb t-el" data-fb="1" style="${style};--bgc:${p.bgc}"><div class="kbar"><span aria-hidden="true">⌕</span><span>${esc(it.detail || text)}</span></div><div class="shapes">${cols}</div></div>`;
    }
    if (it.label === "template") {
      return `<div class="thumb t-tpl" data-fb="1" style="${style};--c1:${p.c1};--c2:${p.c2}"><span class="blob"></span><div class="ttl">${esc(text)}</div><div class="ln"></div><div class="ln"></div></div>`;
    }
    return `<div class="thumb t-vid" data-fb="1" style="${style}"><div class="play"></div><div class="cap">${esc(text)}</div></div>`;
  }
  function thumbHtml(it) {
    if (!it.img) return fallbackThumb(it);
    const r = Math.round(Math.min(1.9, Math.max(0.62, it.ratio || 1.2)) * 100);
    return `<div class="thumb" data-id="${esc(it.id)}" style="aspect-ratio:100/${r}"><img src="${esc(it.img)}" alt="" loading="lazy">${it.src === "tiktok" ? '<div class="play ovl"></div>' : ""}</div>`;
  }
  // Ảnh lỗi (hết hạn, bị xoá): rơi về thumbnail dựng sẵn.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img || img.tagName !== "IMG") return;
    const box = img.closest(".thumb[data-id]");
    if (!box) return;
    const it = [...items, ...adm.list].find((x) => x.id === box.dataset.id);
    if (it) box.outerHTML = fallbackThumb({ ...it, img: null });
  }, true);

  // ---------------------------------------------------------------- số liệu
  const PARTS = ["likes", "comments", "saves", "reposts", "shares"];
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);
  const engagement = (it) => {
    const e = num(it.engagement); if (e !== null) return e;
    const ps = PARTS.map((k) => num(it[k])).filter((v) => v !== null);
    return ps.length ? ps.reduce((a, b) => a + b, 0) : null;
  };
  const fmt = (n) => {
    if (n === null) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(n);
  };
  const EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const HEART = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 21.8l8.8-8.8a5.2 5.2 0 0 0 0-7.4z"/></svg>';
  const metrics = (it) => `<div class="mx"><span title="Lượt xem">${EYE}<b>${fmt(num(it.views))}</b> xem</span><span title="Tương tác: like + comment + save + repost + share">${HEART}<b>${fmt(engagement(it))}</b> tương tác</span></div>`;
  const stamp = (v) => (typeof v === "number" ? v : Date.parse(v) || 0);
  const SORTS = {
    new: (a, b) => stamp(b.createdAt) - stamp(a.createdAt),
    views: (a, b) => (num(b.views) ?? -1) - (num(a.views) ?? -1),
    eng: (a, b) => (engagement(b) ?? -1) - (engagement(a) ?? -1),
  };
  const SAVE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';

  // ---------------------------------------------------------------- trang công khai
  let items = [], loaded = false, loadError = false;
  let saved = new Set(store.get("hub.saved", []));
  const state = { label: "", q: "", plat: "", sort: "new", onlySaved: false };

  function card(it) {
    const on = saved.has(it.id);
    return `<article class="card">
      <a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(it.title || labelName(it.label))} (mở ${SRC[it.src]})">${thumbHtml(it)}<span class="go">Mở trên ${SRC[it.src]} ↗</span></a>
      <span class="tag">${labelName(it.label)}</span>
      <button class="save" type="button" data-id="${esc(it.id)}" aria-pressed="${on}" aria-label="Lưu bài này">${SAVE_SVG}</button>
      <div class="meta"><h3>${esc(it.title || labelName(it.label))}</h3><div class="by"><span class="src ${it.src}">${SRC[it.src]}</span><span class="who">${esc(it.by)}</span></div>${metrics(it)}</div>
    </article>`;
  }

  // Xếp thẻ kiểu masonry theo thứ tự đọc: hàng đầu từ trái sang phải, mỗi thẻ kế tiếp
  // vào cột đang thấp nhất, nên danh sách chạy ngang rồi mới xuống dần.
  let masonryItems = [];
  function masonryCols(el) {
    const w = el.clientWidth || Math.min(1280, window.innerWidth - 32);
    return Math.max(1, Math.min(5, Math.floor((w + 16) / (210 + 16))));
  }
  function masonry(el, htmls) {
    masonryItems = htmls;
    const n = masonryCols(el);
    el.innerHTML = "";
    el.dataset.cols = n;
    const cols = [];
    for (let i = 0; i < n; i++) { const c = document.createElement("div"); c.className = "mcol"; el.append(c); cols.push(c); }
    htmls.forEach((h, i) => {
      let t = cols[0];
      for (const c of cols) if (c.offsetHeight < t.offsetHeight) t = c;
      t.insertAdjacentHTML("beforeend", h);
      t.lastElementChild.dataset.i = i;
    });
  }
  let masonryTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(masonryTimer);
    masonryTimer = setTimeout(() => {
      const el = document.getElementById("grid");
      if (el && el.clientWidth && +el.dataset.cols !== masonryCols(el)) masonry(el, masonryItems);
    }, 120);
  });
  
  function filtered(skipLabel) {
    const q = state.q.trim().toLowerCase();
    return items.filter((it) =>
      (skipLabel || !state.label || it.label === state.label) &&
      (!state.plat || it.src === state.plat) &&
      (!state.onlySaved || saved.has(it.id)) &&
      (!q || [it.title, it.detail, it.by, labelName(it.label)].join(" ").toLowerCase().includes(q)));
  }
  function renderPublic() {
    const list = filtered().sort(SORTS[state.sort]);
    masonry($("#grid"), list.map(card));
    const e = $("#empty");
    if (loadError) { e.hidden = false; e.innerHTML = "<b>Không tải được nội dung</b>Thử tải lại trang sau ít phút."; }
    else if (!loaded) { e.hidden = false; e.innerHTML = "<b>Đang tải…</b>"; }
    else if (!list.length) {
      e.hidden = false;
      e.innerHTML = items.length ? "<b>Chưa có nội dung phù hợp</b>Thử bỏ bộ lọc hoặc đổi từ khoá tìm kiếm."
        : "<b>Hub sắp có nội dung</b>Bạn có thể gửi bài bằng nút “Gửi bài”.";
    } else e.hidden = true;
    $("#savedCount").textContent = saved.size;
    $("#savedBtn").setAttribute("aria-pressed", state.onlySaved);
    const base = filtered(true);
    const chips = [{ id: "", name: "Tất cả", n: base.length }, ...L.LABELS.map((l) => ({ ...l, n: base.filter((i) => i.label === l.id).length }))];
    $("#chips").innerHTML = chips.map((c) => `<button class="chip" type="button" data-l="${c.id}" aria-pressed="${state.label === c.id}">${c.name}<small>${c.n}</small></button>`).join("");
  }
  $("#chips").addEventListener("click", (e) => { const b = e.target.closest("[data-l]"); if (b) { state.label = b.dataset.l; renderPublic(); } });
  $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderPublic(); });
  $("#plat").addEventListener("change", (e) => { state.plat = e.target.value; renderPublic(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderPublic(); });
  $("#savedBtn").addEventListener("click", () => { state.onlySaved = !state.onlySaved; renderPublic(); });
  $("#grid").addEventListener("click", (e) => {
    const s = e.target.closest(".save"); if (!s) return;
    const id = s.dataset.id; saved.has(id) ? saved.delete(id) : saved.add(id);
    store.set("hub.saved", [...saved]);
    if (state.onlySaved) renderPublic(); else { s.setAttribute("aria-pressed", saved.has(id)); $("#savedCount").textContent = saved.size; }
  });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) e.target.closest("dialog").close(); });

  async function loadPublic() {
    try { items = await api.listPublished(); loadError = false; } catch (e) { console.error(e); loadError = true; }
    loaded = true; renderPublic();
  }

  // ---------------------------------------------------------------- gửi bài
  const sDlg = $("#submitDlg");
  $("#s-label").innerHTML = '<option value="">Để Hub tự chọn</option>' + L.LABELS.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
  $("#s-url").addEventListener("input", (e) => {
    const n = L.normalizeUrl(e.target.value);
    $("#s-detect").textContent = n ? `Nhận diện: ${SRC[n.src]}` : "Hỗ trợ Threads, TikTok và Canva.";
  });
  let tsWidget = null;
  function ensureTurnstile() {
    if (!cfg.TURNSTILE_SITE_KEY || tsWidget !== null) return;
    tsWidget = -1;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true;
    s.onload = () => { tsWidget = window.turnstile.render("#ts-box", { sitekey: cfg.TURNSTILE_SITE_KEY }); };
    document.head.append(s);
  }
  $("#submitBtn").addEventListener("click", () => {
    if (api.mode === "static") { if (cfg.SUBMIT_URL) window.open(cfg.SUBMIT_URL, "_blank", "noopener"); return; }
    $("#submitForm").reset(); $("#s-msg").textContent = ""; $("#s-msg").className = "hint err";
    $("#s-detect").textContent = "Hỗ trợ Threads, TikTok và Canva.";
    ensureTurnstile(); sDlg.showModal();
  });
  const SUBMIT_ERR = {
    invalid_url: "Link cần thuộc Threads, TikTok hoặc Canva.",
    rate_limited: "Bạn gửi hơi nhiều bài. Thử lại sau ít phút.",
    captcha: "Chưa xác minh được bạn là người thật. Thử lại.",
    network: "Không kết nối được. Kiểm tra mạng rồi thử lại.",
  };
  $("#submitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#s-msg"), url = $("#s-url").value.trim();
    msg.className = "hint err";
    if (!L.normalizeUrl(url)) { msg.textContent = SUBMIT_ERR.invalid_url; return; }
    const tsReady = () => typeof tsWidget === "string" && window.turnstile && typeof window.turnstile.getResponse === "function";
    const token = tsReady() ? window.turnstile.getResponse(tsWidget) : "";
    if (cfg.TURNSTILE_SITE_KEY && !token) { msg.textContent = "Hãy hoàn tất bước xác minh phía trên."; return; }
    $("#s-submit").disabled = true;
    const r = await api.submit({ url, label: $("#s-label").value, note: $("#s-note").value.trim(), hp: $("#s-hp").value, token });
    $("#s-submit").disabled = false;
    if (tsReady()) window.turnstile.reset(tsWidget);
    if (!r.ok) { msg.textContent = SUBMIT_ERR[r.error] || "Có lỗi, thử lại sau ít phút."; return; }
    sDlg.close();
    toast(r.duplicate ? "Link này đã có trong Hub hoặc đang chờ duyệt. Cảm ơn bạn!" : "Đã nhận bài. Bài sẽ hiện sau khi được duyệt.");
  });

  // ---------------------------------------------------------------- quản trị
  const adm = { tab: "pending", list: [], counts: { pending: 0, published: 0, rejected: 0 }, notes: {}, confirm: null, confirmAll: false, busy: false };
  const TABS = [["pending", "Chờ duyệt"], ["published", "Đã đăng"], ["rejected", "Từ chối"]];

  function showPublic() { $("#adminView").hidden = true; $("#publicView").hidden = false; masonry($("#grid"), masonryItems); }
  async function showAdmin() {
    $("#publicView").hidden = true; $("#adminView").hidden = false;
    for (const id of ["#loginBox", "#denied", "#adminPanel"]) $(id).hidden = true;
    $("#signOutBtn").hidden = true; $("#adminWho").textContent = "";
    const user = await api.user();
    if (!user) { $("#loginBox").hidden = false; return; }
    $("#signOutBtn").hidden = false;
    $("#adminWho").textContent = user.email || "";
    if (!(await api.isAdmin())) { $("#denied").hidden = false; return; }
    $("#adminPanel").hidden = false;
    await loadAdmin();
  }
  function route() { location.hash === "#admin" && api.mode !== "static" ? showAdmin() : showPublic(); }
  window.addEventListener("hashchange", route);

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginBtn").disabled = true;
    const r = await api.signIn($("#loginEmail").value.trim());
    $("#loginBtn").disabled = false;
    if (r.demo) { showAdmin(); return; }
    $("#loginMsg").className = "hint " + (r.ok ? "ok" : "err");
    $("#loginMsg").textContent = r.ok ? "Đã gửi link đăng nhập. Mở email và bấm vào link để vào trang quản trị." : "Không gửi được: " + (r.error || "lỗi không rõ");
  });
  $("#signOutBtn").addEventListener("click", async () => { await api.signOut(); showAdmin(); });
  api.onAuth(() => { if (location.hash === "#admin") showAdmin(); });

  async function loadAdmin() {
    try {
      const [counts, list] = await Promise.all([api.counts(), api.adminList(adm.tab)]);
      adm.counts = counts; adm.list = list;
    } catch (e) { console.error(e); toast("Không tải được danh sách"); }
    renderAdmin();
  }
  function rowButtons(it) {
    const b = (act, text, cls = "") => `<button class="btn sm ${cls}" type="button" data-act="${act}" data-id="${esc(it.id)}">${text}</button>`;
    const del = b("del", adm.confirm === it.id ? "Bấm lần nữa để xoá" : "Xoá", "danger");
    if (adm.tab === "pending") return b("approve", "Duyệt", "primary") + b("enrich", "Bổ sung") + b("edit", "Sửa") + b("reject", "Từ chối") + del;
    if (adm.tab === "published") return b("enrich", "Bổ sung") + b("edit", "Sửa") + b("pending", "Gỡ về chờ duyệt") + del;
    return b("pending", "Đưa về chờ duyệt") + b("edit", "Sửa") + del;
  }
  function renderAdmin() {
    $("#adminTabs").innerHTML = TABS.map(([id, name]) =>
      `<button class="chip" type="button" role="tab" data-tab="${id}" aria-pressed="${adm.tab === id}">${name}<small>${adm.counts[id] ?? 0}</small></button>`).join("");
    $("#approveAllBtn").hidden = adm.tab !== "pending";
    $("#approveAllBtn").textContent = adm.confirmAll ? `Bấm lần nữa để duyệt ${adm.list.length} bài` : "Duyệt tất cả";
    $("#approveAllBtn").disabled = !adm.list.length || adm.busy;
    $("#enrichAllBtn").disabled = !adm.list.length || adm.busy;
    $("#importBtn").disabled = adm.busy;
    $("#adminList").innerHTML = adm.list.length ? adm.list.map((it) => `
      <div class="arow"><div class="mini">${thumbHtml(it)}</div><div class="abody">
        <b>${esc(it.title || "(chưa có tiêu đề)")}</b>
        <span class="hint">${labelName(it.label)} · ${SRC[it.src]}${it.by ? " · " + esc(it.by) : ""}${it.detail ? " · " + esc(it.detail) : ""}</span>
        <a class="lnk" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.url.replace(/^https?:\/\/(www\.)?/, ""))} ↗</a>
        ${it.note ? `<span class="note">Ghi chú của người gửi: ${esc(it.note)}</span>` : ""}
        ${metrics(it)}
        ${adm.notes[it.id] ? `<span class="why">${esc(adm.notes[it.id])}</span>` : ""}
        <div class="abtns">${rowButtons(it)}</div></div></div>`).join("")
      : '<div class="empty"><b>Không có bài nào ở đây</b>Bài khách gửi sẽ hiện trong tab Chờ duyệt.</div>';
  }
  $("#adminTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    adm.tab = b.dataset.tab; adm.confirm = null; adm.confirmAll = false; loadAdmin();
  });

  function progress(t) { $("#adminProgress").textContent = t || ""; }
  async function enrichIds(ids) {
    adm.busy = true; renderAdmin();
    let ok = 0;
    for (let i = 0; i < ids.length; i++) {
      progress(`Đang bổ sung ${i + 1}/${ids.length}…`);
      let r;
      try { r = await api.enrich(ids[i]); } catch (e) { r = { ok: false, notes: ["Lỗi gọi dịch vụ"] }; }
      adm.notes[ids[i]] = (r.notes || []).join(". ");
      if (r.ok && r.updated && r.updated.length) ok++;
    }
    adm.busy = false; progress(`Đã bổ sung ${ok}/${ids.length} bài. Dòng đỏ dưới mỗi bài cho biết phần chưa lấy được.`);
    await loadAdmin();
  }
  $("#enrichAllBtn").addEventListener("click", () => {
    const need = adm.list.filter((it) => !it.img || !it.title).map((it) => it.id);
    if (!need.length) { toast("Các bài trong tab này đã đủ ảnh và tiêu đề"); return; }
    enrichIds(need);
  });
  $("#approveAllBtn").addEventListener("click", async () => {
    if (!adm.confirmAll) { adm.confirmAll = true; renderAdmin(); setTimeout(() => { if (adm.confirmAll) { adm.confirmAll = false; renderAdmin(); } }, 4000); return; }
    adm.confirmAll = false;
    try { await api.setStatus(adm.list.map((i) => i.id), "published"); toast("Đã duyệt tất cả"); } catch (e) { toast("Không duyệt được, thử lại"); }
    loadAdmin();
  });
  $("#adminList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.dataset.id, it = adm.list.find((x) => x.id === id), act = b.dataset.act;
    if (!it) return;
    try {
      if (act === "approve") { await api.setStatus([id], "published"); toast("Đã duyệt"); }
      else if (act === "reject") { await api.setStatus([id], "rejected"); toast("Đã từ chối"); }
      else if (act === "pending") { await api.setStatus([id], "pending"); toast("Đã đưa về chờ duyệt"); }
      else if (act === "edit") { openEdit(it); return; }
      else if (act === "enrich") { await enrichIds([id]); return; }
      else if (act === "del") {
        if (adm.confirm !== id) { adm.confirm = id; renderAdmin(); return; }
        adm.confirm = null; await api.removeItem(id, it.imagePath); toast("Đã xoá");
      }
    } catch (err) { console.error(err); toast("Không thực hiện được, thử lại"); }
    loadAdmin();
  });

  // ---- sửa bài
  const eDlg = $("#editDlg"), eForm = $("#editForm");
  $("#e-label").innerHTML = L.LABELS.map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
  let editing = null;
  function openEdit(it) {
    editing = it; eForm.reset(); $("#e-msg").textContent = "";
    $("#e-url").textContent = it.url;
    $("#e-title").value = it.title; $("#e-label").value = it.label; $("#e-status").value = it.status;
    $("#e-by").value = it.by; $("#e-detail").value = it.detail;
    for (const k of ["views", ...PARTS]) $("#m-" + k).value = num(it[k]) !== null ? it[k] : "";
    $("#e-pv").hidden = !it.img; if (it.img) $("#e-pvimg").src = it.img;
    eDlg.showModal();
  }
  eDlg.addEventListener("paste", (e) => {
    const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => x.type.startsWith("image/"));
    if (!f) return;
    try { const dt = new DataTransfer(); dt.items.add(f); $("#e-img").files = dt.files; toast("Đã dán ảnh"); } catch { toast("Không dán được, hãy chọn tệp ảnh"); }
  });
  function resizeImage(file, maxW) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const s = Math.min(1, maxW / im.width), c = document.createElement("canvas");
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((blob) => res(blob ? { blob, ratio: +(c.height / c.width).toFixed(4) } : null), "image/jpeg", 0.82);
      };
      im.onerror = () => { URL.revokeObjectURL(url); res(null); };
      im.src = url;
    });
  }
  eForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const patch = { title: $("#e-title").value.trim(), label: $("#e-label").value, status: $("#e-status").value, by: $("#e-by").value.trim(), detail: $("#e-detail").value.trim() };
    for (const k of ["views", ...PARTS]) { const raw = $("#m-" + k).value.trim(); patch[k] = raw === "" ? null : Math.max(0, Math.round(+raw)); }
    $("#e-submit").disabled = true; $("#e-msg").textContent = "";
    try {
      await api.updateItem(editing.id, patch);
      const f = $("#e-img").files[0];
      if (f) {
        const r = await resizeImage(f, 640);
        if (!r) throw new Error("Không đọc được ảnh");
        await api.uploadImage(editing.id, r.blob, r.ratio, editing.imagePath);
      }
      eDlg.close(); toast("Đã lưu"); await loadAdmin();
    } catch (err) { console.error(err); $("#e-msg").textContent = "Không lưu được: " + (err.message || "lỗi không rõ"); }
    $("#e-submit").disabled = false;
  });

  // ---- nhập hàng loạt
  const iDlg = $("#importDlg");
  $("#importBtn").addEventListener("click", () => { $("#i-text").value = ""; $("#i-msg").textContent = ""; iDlg.showModal(); });
  $("#importForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { rows, bad } = L.parseImportLines($("#i-text").value);
    if (!rows.length) { $("#i-msg").textContent = "Không có dòng hợp lệ. Mỗi dòng cần link Threads, TikTok hoặc Canva."; return; }
    $("#i-submit").disabled = true;
    try {
      const r = await api.importRows(rows);
      iDlg.close();
      toast(`Đã thêm ${r.added} bài vào hàng chờ${r.skipped ? `, bỏ qua ${r.skipped} link trùng` : ""}${bad.length ? `, ${bad.length} dòng lỗi` : ""}`);
      adm.tab = "pending"; await loadAdmin();
    } catch (err) { console.error(err); $("#i-msg").textContent = "Không thêm được: " + (err.message || "lỗi không rõ"); }
    $("#i-submit").disabled = false;
  });

  // ---------------------------------------------------------------- khởi động
  if (api.mode === "demo") $("#demoNotice").hidden = false;
  if (api.mode === "static") {
    document.querySelector(".adm-link").hidden = true;
    if (!cfg.SUBMIT_URL) $("#submitBtn").hidden = true;
  }
  const rl = $("#reportLink");
  if (cfg.REPORT_EMAIL) rl.href = "mailto:" + cfg.REPORT_EMAIL + "?subject=" + encodeURIComponent("Yêu cầu gỡ bài trên Canva Hub");
  else { rl.removeAttribute("href"); rl.textContent = "liên hệ quản trị viên"; }
  // Link đăng nhập trả về ?admin=1&code=…: vào thẳng trang quản trị, để supabase-js tự dọn tham số code.
  if (new URLSearchParams(location.search).get("admin")) location.hash = "#admin";
  renderPublic(); route(); loadPublic();
})();
