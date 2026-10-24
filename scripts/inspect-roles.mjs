import fs from "node:fs";

const p = fs.readFileSync("app/page.tsx", "utf8");
const nav = p.match(/const nav = \[[\s\S]*?\];/);
console.log(nav?.[0] ?? "NO NAV");
console.log("---roles---");
console.log([...p.matchAll(/role === "([^"]+)"/g)].map((m) => m[1]));
console.log("---isClient---");
p.split(/\n/).forEach((l, i) => {
  if (/isClient|isWebCollaborator|profile\?\.role ===/.test(l)) {
    console.log(`${i + 1}:${l.trim().slice(0, 140)}`);
  }
});
console.log("---nav items---");
console.log([...p.matchAll(/"([^"]+)"/g)].slice(0, 30).map((m) => m[1]));
