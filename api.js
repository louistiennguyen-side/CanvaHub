// Lớp dữ liệu: Supabase thật khi có cấu hình, ngược lại là chế độ demo trong bộ nhớ. Cùng một giao diện.
(function () {
  const cfg = window.HUB_CONFIG || {};
  const L = window.HubLib;
  const live = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  const PUBLIC_COLS = "id,url,src,label,title,by_handle,detail,image_path,image_ratio,views,likes,comments,saves,reposts,shares,engagement,status,created_at,published_at";

  function fromRow(r) {
    return {
      id: r.id, url: r.url, src: r.src, label: r.label, title: r.title || "", by: r.by_handle || "", detail: r.detail || "",
      imagePath: r.image_path || null,
      img: r.image_path ? `${cfg.SUPABASE_URL}/storage/v1/object/public/thumbs/${r.image_path}` : null,
      ratio: r.image_ratio ? Number(r.image_ratio) : null,
      views: r.views, likes: r.likes, comments: r.comments, saves: r.saves, reposts: r.reposts, shares: r.shares,
      engagement: r.engagement, status: r.status, createdAt: r.published_at || r.created_at,
      note: r.item_private ? (Array.isArray(r.item_private) ? (r.item_private[0] || {}).note : r.item_private.note) || "" : "",
    };
  }
  const METRICS = ["views", "likes", "comments", "saves", "reposts", "shares"];
  function toPatch(p) {
    const o = {};
    if ("title" in p) o.title = p.title;
    if ("by" in p) o.by_handle = p.by;
    if ("detail" in p) o.detail = p.detail;
    if ("label" in p) { o.label = p.label; o.label_set = true; }
    if ("status" in p) o.status = p.status;
    for (const k of METRICS) if (k in p) o[k] = p[k];
    return o;
  }

  // ------------------------------------------------------------ Supabase thật
  function makeLive() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true } });
    return {
      mode: "live",
      async listPublished() {
        const { data, error } = await sb.from("items").select(PUBLIC_COLS).eq("status", "published")
          .order("published_at", { ascending: false }).limit(1000);
        if (error) throw error;
        return data.map(fromRow);
      },
      async submit({ url, label, note, hp, token }) {
        try {
          const res = await fetch(`${cfg.SUPABASE_URL}/functions/v1/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ url, label, note, hp, token }),
          });
          const j = await res.json().catch(() => ({}));
          return res.ok ? { ok: true, duplicate: !!j.duplicate } : { ok: false, error: j.error || "server_error" };
        } catch { return { ok: false, error: "network" }; }
      },
      // Quản trị
      async user() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; },
      onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s ? s.user : null)); },
      async signIn(email) {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + "?admin=1" } });
        return { ok: !error, error: error && error.message };
      },
      async signOut() { await sb.auth.signOut(); },
      async isAdmin() { const { data, error } = await sb.rpc("is_admin"); return !error && data === true; },
      async counts() {
        const out = {};
        await Promise.all(["pending", "published", "rejected"].map(async (s) => {
          const { count } = await sb.from("items").select("id", { count: "exact", head: true }).eq("status", s);
          out[s] = count || 0;
        }));
        return out;
      },
      async adminList(status) {
        const { data, error } = await sb.from("items").select("*, item_private(note)").eq("status", status)
          .order("created_at", { ascending: false }).limit(1000);
        if (error) throw error;
        return data.map(fromRow);
      },
      async updateItem(id, patch) {
        const { error } = await sb.from("items").update(toPatch(patch)).eq("id", id);
        if (error) throw error;
      },
      async setStatus(ids, status) {
        const { error } = await sb.from("items").update({ status }).in("id", ids);
        if (error) throw error;
      },
      async removeItem(id, imagePath) {
        const { error } = await sb.from("items").delete().eq("id", id);
        if (error) throw error;
        if (imagePath) await sb.storage.from("thumbs").remove([imagePath]);
      },
      async importRows(rows) {
        const payload = rows.map((r) => ({
          url: r.url, url_key: r.key, src: r.src, label: r.label || L.classify(r.title + " " + r.detail, r.src), label_set: !!r.label,
          title: r.title, by_handle: r.by, detail: r.detail, status: "pending",
        }));
        const { data, error } = await sb.from("items").upsert(payload, { onConflict: "url_key", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        return { added: data.length, skipped: rows.length - data.length };
      },
      async uploadImage(id, blob, ratio, oldPath) {
        const path = `items/${id}-${Date.now()}.jpg`;
        const up = await sb.storage.from("thumbs").upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (up.error) throw up.error;
        const { error } = await sb.from("items").update({ image_path: path, image_ratio: ratio }).eq("id", id);
        if (error) throw error;
        if (oldPath) await sb.storage.from("thumbs").remove([oldPath]);
      },
      async enrich(id) {
        const { data, error } = await sb.functions.invoke("enrich", { body: { id } });
        if (error) return { ok: false, notes: [error.message || "Lỗi gọi dịch vụ"] };
        return data;
      },
      async imagePathOf(id) {
        const { data } = await sb.from("items").select("image_path").eq("id", id).maybeSingle();
        return data ? data.image_path : null;
      },
    };
  }

  // ------------------------------------------------------------ Demo (không lưu)
  function makeDemo() {
    let seq = 100;
    const mk = (o) => ({ id: "d" + (seq++), status: "published", title: "", by: "", detail: "", img: null, ratio: null, views: null, likes: null, comments: null, saves: null, reposts: null, shares: null, engagement: null, note: "", createdAt: new Date(Date.now() - seq * 36e5).toISOString(), ...o });
    const eng = (o) => { const p = ["likes", "comments", "saves", "reposts", "shares"].map((k) => o[k]).filter((v) => v != null); return p.length ? p.reduce((a, b) => a + b, 0) : null; };
    let rows = [
      mk({ src: "threads", label: "font", title: "Bộ ba phông serif cho poster sự kiện sang trọng", by: "@mau_demo_01", detail: "Playfair Display", url: "https://www.threads.com/@mau_demo_01/post/demo1", views: 18400, likes: 1200, comments: 86, saves: 540, reposts: 60, shares: 31 }),
      mk({ src: "threads", label: "element", title: "Từ khoá tạo nền giấy nhăn kiểu scrapbook", by: "@mau_demo_02", detail: "paper texture torn", url: "https://www.threads.com/@mau_demo_02/post/demo2", views: 9300, likes: 640, comments: 40, saves: 410, reposts: 22, shares: 18 }),
      mk({ src: "tiktok", label: "tutorial", title: "Căn chỉnh nhanh bằng phím tắt trong 30 giây", by: "@mau_demo_03", url: "https://www.tiktok.com/@mau_demo_03/video/1", views: 152000, likes: 12800, comments: 310, saves: 4100, shares: 900 }),
      mk({ src: "canva", label: "template", title: "Template CV một trang tone be tối giản", by: "@mau_demo_04", url: "https://www.canva.com/templates?query=cv" }),
      mk({ src: "threads", label: "font", title: "Phông chữ viết tay dễ thương cho caption", by: "@mau_demo_05", detail: "Caveat", url: "https://www.threads.com/@mau_demo_05/post/demo5", views: 5200, likes: 330, comments: 12, saves: 120 }),
      mk({ src: "tiktok", label: "tutorial", title: "Xoá nền ảnh và tạo sticker bo viền", by: "@mau_demo_06", url: "https://www.tiktok.com/@mau_demo_06/video/2", views: 88000, likes: 7400, comments: 190, saves: 2200, shares: 430 }),
      mk({ src: "threads", label: "element", title: "Từ khoá cho khung ảnh phong cách film", by: "@mau_demo_07", detail: "film strip frame", url: "https://www.threads.com/@mau_demo_07/post/demo7" }),
      mk({ src: "canva", label: "template", title: "Bộ story Instagram pastel cho shop nhỏ", by: "@mau_demo_08", url: "https://www.canva.com/templates?query=story" }),
      mk({ src: "tiktok", label: "font", title: "Phông display đậm cho tiêu đề thumbnail", by: "@mau_demo_09", detail: "Anton", url: "https://www.tiktok.com/@mau_demo_09/video/3", views: 41000, likes: 3300 }),
      mk({ src: "threads", label: "tutorial", title: "Brand Kit: lưu màu và phông để dùng lại", by: "@mau_demo_10", url: "https://www.threads.com/@mau_demo_10/post/demo10", views: 7700, likes: 510, comments: 25, saves: 300 }),
      mk({ src: "threads", status: "pending", label: "template", title: "", by: "@nguoi_gui_1", url: "https://www.threads.com/@nguoi_gui_1/post/demoP1", note: "Mẫu menu quán cà phê đẹp" }),
      mk({ src: "tiktok", status: "pending", label: "tutorial", title: "", by: "", url: "https://vt.tiktok.com/ZSdemo/", note: "" }),
    ];
    rows.forEach((r) => { r.engagement = eng(r); });
    return {
      mode: "demo",
      async listPublished() { return rows.filter((r) => r.status === "published").map((r) => ({ ...r })); },
      async submit({ url, label, note, hp }) {
        if (hp) return { ok: true };
        const n = L.normalizeUrl(url);
        if (!n) return { ok: false, error: "invalid_url" };
        if (rows.some((r) => L.normalizeUrl(r.url)?.key === n.key)) return { ok: true, duplicate: true };
        rows.unshift(mk({ src: n.src, status: "pending", label: label || L.classify(note, n.src), by: L.handleFromUrl(n.url), url: n.url, note: note || "" }));
        return { ok: true, duplicate: false };
      },
      async user() { return this._user || null; },
      onAuth() {},
      async signIn(email) { this._user = { email }; return { ok: true, demo: true }; },
      async signOut() { this._user = null; },
      async isAdmin() { return !!this._user; },
      async counts() { const o = { pending: 0, published: 0, rejected: 0 }; rows.forEach((r) => o[r.status]++); return o; },
      async adminList(status) { return rows.filter((r) => r.status === status).map((r) => ({ ...r })); },
      async updateItem(id, patch) {
        const r = rows.find((x) => x.id === id); if (!r) return;
        Object.assign(r, patch); r.engagement = eng(r);
      },
      async setStatus(ids, status) { rows.forEach((r) => { if (ids.includes(r.id)) r.status = status; }); },
      async removeItem(id) { rows = rows.filter((r) => r.id !== id); },
      async importRows(list) {
        let added = 0;
        for (const r of list) {
          if (rows.some((x) => L.normalizeUrl(x.url)?.key === r.key)) continue;
          rows.unshift(mk({ src: r.src, status: "pending", label: r.label || L.classify(r.title + " " + r.detail, r.src), title: r.title, by: r.by, detail: r.detail, url: r.url })); added++;
        }
        return { added, skipped: list.length - added };
      },
      async uploadImage(id, blob, ratio) {
        const r = rows.find((x) => x.id === id); if (!r) return;
        r.img = await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob); });
        r.ratio = ratio;
      },
      async enrich() { return { ok: false, updated: [], notes: ["Chế độ demo: không có dịch vụ lấy ảnh. Cấu hình Supabase để dùng."] }; },
      async imagePathOf() { return null; },
    };
  }


  // ------------------------------------------------------------ Web tĩnh (dữ liệu nằm trong data.js, chỉ đọc)
  function makeStatic() {
    const rows = ((window.HUB_DATA && window.HUB_DATA.items) || []).map((r) => ({ status: "published", note: "", ...r }));
    const none = async () => null;
    return {
      mode: "static",
      async listPublished() { return rows.map((r) => ({ ...r })); },
      async submit() { return { ok: false, error: "static" }; },
      user: none, onAuth() {}, async signIn() { return { ok: false }; }, async signOut() {},
      async isAdmin() { return false; }, async counts() { return { pending: 0, published: rows.length, rejected: 0 }; },
      async adminList() { return []; }, async updateItem() {}, async setStatus() {}, async removeItem() {},
      async importRows() { return { added: 0, skipped: 0 }; }, async uploadImage() {}, async enrich() { return { ok: false, notes: [] }; },
      async imagePathOf() { return null; },
    };
  }

  window.HubAPI = window.HUB_DATA ? makeStatic() : live ? makeLive() : makeDemo();
})();
