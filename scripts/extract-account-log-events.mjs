import fs from "node:fs";

for (const [label, file] of [["network", ".manus-logs/networkRequests.log"], ["browser", ".manus-logs/browserConsole.log"], ["server", ".manus-logs/devserver.log"]]) {
  console.log(`--- ${label} ---`);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
    if (!line) continue;
    let parsed;
    try { parsed = JSON.parse(line.replace(/^\[[^\]]+\]\s*/, "")); } catch { continue; }
    const raw = JSON.stringify(parsed);
    if (/createManagedAccount|qa-repro|duplicate|constraint|database|Failed to fetch|ERROR|error|Error/i.test(raw)) {
      const output = {
        time: line.match(/^\[([^\]]+)/)?.[1],
        type: parsed.type,
        level: parsed.level,
        method: parsed.method,
        url: parsed.url,
        status: parsed.response?.status,
        duration: parsed.duration,
        args: parsed.args,
        message: parsed.message,
        error: parsed.error,
      };
      console.log(JSON.stringify(output));
    }
  }
}
