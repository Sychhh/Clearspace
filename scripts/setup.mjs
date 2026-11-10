import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env already exists; no values were changed.");
} else {
  const s = readFileSync(".env.example", "utf8")
    .replace(
      "replace-with-a-strong-private-password",
      randomBytes(18).toString("base64url"),
    )
    .replace(
      "replace-with-a-random-secret-at-least-32-characters",
      randomBytes(48).toString("base64url"),
    );
  writeFileSync(".env", s, { mode: 0o600 });
  console.log(
    "Created .env. Open it locally to add AION_API_KEY and review APP_PASSWORD. No secrets were printed.",
  );
}
