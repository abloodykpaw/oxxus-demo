import fs from "node:fs";
const p = fs.readFileSync("app/page.tsx", "utf8");
const i = p.indexOf("isClient =");
console.log(JSON.stringify(p.slice(i, i + 220)));
console.log("---");
const j = p.indexOf("previewRole");
console.log(p.slice(j - 80, j + 120));
console.log("--- onboarding fields ---");
console.log([...p.matchAll(/onboarding\?\.([a-z_]+)/g)].map((m) => m[1]));
