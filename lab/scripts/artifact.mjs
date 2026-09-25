// Repackage the single-file Vite build as page content for publishing:
// <title>, font links and the inline <style> first, then the app root and the module script.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const links = html.match(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g).join("\n");
const style = html.match(/<style[^>]*>[\s\S]*?<\/style>/)[0];
const script = html.match(/<script type="module"[^>]*>[\s\S]*?<\/script>/)[0].replace(" crossorigin", "");
const out = `${title}\n${links}\n${style}\n<div id="app"></div>\n${script}\n`;
writeFileSync(new URL("../dist/lab.html", import.meta.url), out);
console.log("dist/lab.html", (out.length / 1024).toFixed(0), "KB");
