import { readFileSync } from "node:fs";
import { createApp } from "../server.mjs";
const filename = process.argv[2];
if (!filename)
  throw new Error(
    "Usage: npm run import -- path/to/clearspace-export.json (stop the server first).",
  );
const data = JSON.parse(readFileSync(filename, "utf8"));
if (
  data.version !== 1 ||
  !Array.isArray(data.records) ||
  typeof data.profile !== "string"
)
  throw new Error("Unsupported export.");
for (const r of data.records) {
  if (
    !r ||
    typeof r.id !== "string" ||
    !["task", "idea"].includes(r.kind) ||
    typeof r.title !== "string" ||
    typeof r.body !== "string"
  )
    throw new Error("Invalid record in export.");
}
const { db } = createApp();
db.exec("BEGIN");
try {
  const put = db.prepare(
    "INSERT INTO records(id,kind,payload,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,updated=excluded.updated",
  );
  for (const r of data.records)
    put.run(r.id, r.kind, JSON.stringify(r), Date.now());
  db.prepare("UPDATE settings SET profile=? WHERE id=1").run(data.profile);
  db.exec("COMMIT");
  console.log(
    `Imported ${data.records.length} entries and the profile. Existing records with other IDs were kept. No API key was imported.`,
  );
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
