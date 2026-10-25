import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
const dist = new URL("../dist", import.meta.url).pathname;
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  let p = req.url.split("?")[0]; if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(dist, p)); res.writeHead(200, { "content-type": mime[extname(p)] || "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await (await browser.newContext({ viewport: vp, locale: "fr-FR" })).newPage();
  // simule l'extension : remplace les <select> par un widget pleine largeur
  await page.addInitScript(() => {
    const obs = new MutationObserver(() => {
      document.querySelectorAll("select:not([data-bb-done])").forEach((sel) => {
        sel.dataset.bbDone = "1";
        const d = document.createElement("div");
        d.className = "bb-custom-select-container bb-customSelect";
        d.textContent = sel.options[sel.selectedIndex]?.text || "";
        sel.replaceWith(d);
      });
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const st = document.createElement("style");
    st.textContent = ".bb-custom-select-container{display:block;width:100%;background:#fff;color:#23252a;border-radius:8px;padding:6px 9px;font-size:13px;}";
    document.documentElement.appendChild(st);
  });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/simext-${name}.png` });
  const m = await page.evaluate(() => {
    const t = document.querySelector(".topbar"); if (!t) return null;
    return { bar: Math.round(t.getBoundingClientRect().width), kids: [...t.children].map((c) => ({ cls: c.className || c.tagName, w: Math.round(c.getBoundingClientRect().width) })) };
  });
  console.log(name, JSON.stringify(m));
  await page.context().close();
}
await browser.close(); server.close();
