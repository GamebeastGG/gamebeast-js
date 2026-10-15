// Fails when the browser bundle could pull in anything but the Zod-free part of the contract.
//
// `@gamebeast/js` must stay small: the contract's schemas (and Zod, ~90 KB gzipped) are for
// `@gamebeast/node` only. Type imports are erased, so a value import from `@gamebeast/sdk-contract`
// (the root) in code the browser reaches is what this catches — both in this package and in
// `@gamebeast/core`, which ships inside every browser bundle.
import { readFileSync } from "node:fs";

const CHECKS = [
  {
    entries: ["dist/index.js", "dist/index.cjs"],
    allowed: new Set(["@gamebeast/core"]),
  },
  {
    entries: ["../core/dist/index.js", "../core/dist/index.cjs"],
    allowed: new Set(["@gamebeast/sdk-contract/core"]),
  },
];

let failed = false;
for (const { entries, allowed } of CHECKS) {
  for (const entry of entries) {
    // npm runs package scripts from the package directory.
    const source = readFileSync(entry, "utf8");
    const specifiers = [
      ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
      ...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);

    for (const specifier of new Set(specifiers)) {
      if (specifier.startsWith(".") || allowed.has(specifier)) continue;
      console.error(
        `${entry} imports "${specifier}"; it may only import ${[...allowed].join(", ")}.`
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Browser bundle imports only @gamebeast/core and @gamebeast/sdk-contract/core.");
