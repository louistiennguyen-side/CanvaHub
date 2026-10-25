// TỰ SINH từ supabase/functions/_shared/lib.js bằng scripts/sync-lib.mjs. Không sửa tay.
window.HubLib = (function () {
// Logic dùng chung cho Edge Functions và trang web.
// Chỉ sửa file này, rồi chạy `node scripts/sync-lib.mjs` để cập nhật web/lib.js.

const LABELS = [
  { id: "font", name: "Phông chữ" },
  { id: "element", name: "Từ khoá Elements" },
  { id: "template", name: "Templates đặc sắc" },
  { id: "tutorial", name: "Video mẹo Canva" },
];

const TRACKING = /^(utm_|xmt$|slof$|hl$|igshid$|igsh$|is_from_webapp$|sender_device$|web_id$|_r$|_t$|fbclid$|share_app_id$|share_link_id$|sec_user_id$|social_sharing$)/i;

function detectSource(host) {
  const h = host.toLowerCase();
  if (/(^|\.)threads\.(net|com)$/.test(h)) return "threads";
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(^|\.)canva\.(com|link)$/.test(h)) return "canva";
  return null;
}

// Trả về { url, key, src } hoặc null nếu link không hợp lệ hoặc không thuộc Threads, TikTok, Canva.
function normalizeUrl(input) {
  let u;
  try { u = new URL(String(input || "").trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const src = detectSource(u.hostname);
  if (!src) return null;
  u.protocol = "https:";
  u.hash = "";
  if (src === "threads") u.hostname = "www.threads.com";
  else u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  let path = u.pathname.replace(/\/+$/, "");
  const query = u.searchParams.toString();
  const url = `https://${u.hostname}${path}${query ? "?" + query : ""}`;
  const key = `${u.hostname.replace(/^www\./, "")}${path}${query ? "?" + query : ""}`;
  if (path === "" || path === "/") return null;
  return { url, key, src };
}

function handleFromUrl(url) {
  const m = String(url).match(/\/@([\w.]+)/);
  return m ? "@" + m[1] : "";
}

// Tiêu đề = câu đầu tiên của caption, tối đa 90 ký tự.
function firstSentence(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^.+?(?:[.!?…。]+(?=\s|$)|$)/);
  const out = (m ? m[0] : t).trim();
  return out.length > 90 ? out.slice(0, 89).trimEnd() + "…" : out;
}

const KEYWORDS = {
  font: /font|phông|typeface|kiểu chữ|chữ viết/g,
  element: /từ khoá|từ khóa|keyword|element|sticker|họa tiết|hoạ tiết|icon|khung ảnh|nền/g,
  template: /template|mẫu|layout|bố cục|slide|\bcv\b|poster|menu/g,
  tutorial: /hướng dẫn|cách |mẹo|\btips?\b|tutorial|bước|phím tắt|shortcut|how to|tính năng|animate|xoá nền|brand kit/g,
};

// Nhãn = nhóm từ khoá xuất hiện nhiều nhất; hoà hoặc không có thì theo nguồn.
function classify(text, src) {
  const t = String(text || "").toLowerCase();
  let best = "", score = 0;
  for (const k of Object.keys(KEYWORDS)) {
    const n = (t.match(KEYWORDS[k]) || []).length;
    if (n > score) { score = n; best = k; }
  }
  if (best) return best;
  return src === "tiktok" ? "tutorial" : src === "canva" ? "template" : "element";
}

// "1,2K" "3.4M" "12 N" (nghìn) "1,5 Tr" (triệu) hoặc số thường -> số nguyên.
function parseCount(s) {
  const m = String(s ?? "").trim().replace(/\s+/g, " ").match(/^([\d.,]+)\s*(k|m|b|n|tr|nghìn|triệu)?$/i);
  if (!m) return null;
  const unit = (m[2] || "").toLowerCase();
  let num = m[1];
  if (unit) num = num.replace(",", ".");
  else num = num.replace(/[.,](?=\d{3}\b)/g, "");
  const v = parseFloat(num);
  if (!isFinite(v)) return null;
  const mult = { k: 1e3, n: 1e3, "nghìn": 1e3, m: 1e6, tr: 1e6, "triệu": 1e6, b: 1e9 }[unit] || 1;
  return Math.round(v * mult);
}

function metaContent(html, prop) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i").exec(html);
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i").exec(html);
  const v = (a || b || [])[1];
  return v ? v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";
}
function extractMeta(html) {
  return {
    image: metaContent(html, "og:image"),
    title: metaContent(html, "og:title"),
    description: metaContent(html, "og:description"),
  };
}

function findStats(node) {
  if (!node || typeof node !== "object") return null;
  if (node.stats && typeof node.stats === "object" && ("playCount" in node.stats || "diggCount" in node.stats)) return node.stats;
  if (node.statsV2 && typeof node.statsV2 === "object" && ("playCount" in node.statsV2 || "diggCount" in node.statsV2)) return node.statsV2;
  for (const v of Object.values(node)) {
    const r = findStats(v);
    if (r) return r;
  }
  return null;
}
const n0 = (v) => { const n = Number(v); return isFinite(n) && n >= 0 ? Math.round(n) : null; };

// TikTok nhúng số liệu trong <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">.
function parseTikTokStats(html) {
  const m = /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  const s = findStats(data);
  if (!s) return null;
  return {
    views: n0(s.playCount), likes: n0(s.diggCount), comments: n0(s.commentCount),
    saves: n0(s.collectCount), shares: n0(s.shareCount), reposts: n0(s.repostCount),
  };
}

// Threads: tìm số liệu gần mã bài trong JSON nhúng. Làm theo khả năng; không chắc có trong mọi bài.
function parseThreadsStats(html, code) {
  if (!code) return null;
  const i = html.indexOf(`"code":"${code}"`);
  if (i < 0) return null;
  // Chỉ đọc phần ngay sau mã bài, dừng ở mã bài kế tiếp, để không lấy nhầm số của bài khác.
  const next = html.indexOf('"code":"', i + 8);
  const regions = [html.slice(i, next > 0 ? Math.min(next, i + 6000) : i + 6000)];
  const re = {
    views: /"(?:view_count|ig_play_count|play_count)":(\d+)/,
    likes: /"like_count":(\d+)/,
    comments: /"(?:direct_reply_count|reply_count)":(\d+)/,
    reposts: /"repost_count":(\d+)/,
    shares: /"reshare_count":(\d+)/,
  };
  const out = {};
  for (const k of Object.keys(re)) {
    out[k] = null;
    for (const r of regions) { const m = re[k].exec(r); if (m) { out[k] = n0(m[1]); break; } }
  }
  return Object.values(out).some((v) => v !== null) ? out : null;
}

// Đọc kích thước ảnh PNG, JPEG, WEBP từ byte đầu tiên.
function imageSize(b) {
  if (!b || b.length < 24) return null;
  if (b[0] === 0x89 && b[1] === 0x50) {
    return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") {
    const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (t === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (t === "VP8L") {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
    }
    if (t === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

// Mỗi dòng: link | nhãn | tiêu đề | người tạo | font hoặc từ khoá
const LABEL_ALIAS = { font: "font", "phông": "font", "phông chữ": "font", element: "element", elements: "element", "từ khoá": "element", template: "template", templates: "template", video: "tutorial", tutorial: "tutorial", "mẹo": "tutorial" };
function parseImportLines(text, max = 200) {
  const rows = [], bad = [];
  const seen = new Set();
  for (const line of String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max)) {
    const [raw, lab, title, by, detail] = line.split("|").map((x) => x.trim());
    const n = normalizeUrl(raw);
    if (!n) { bad.push(line); continue; }
    if (seen.has(n.key)) continue;
    seen.add(n.key);
    rows.push({
      ...n,
      label: LABEL_ALIAS[(lab || "").toLowerCase()] || null,
      title: title || "",
      by: by || handleFromUrl(n.url),
      detail: detail || "",
    });
  }
  return { rows, bad };
}

return { LABELS, detectSource, normalizeUrl, handleFromUrl, firstSentence, classify, parseCount, extractMeta, parseTikTokStats, parseThreadsStats, imageSize, parseImportLines };
})();
