import { spawnSync } from "node:child_process";

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!apiUrl || new URL(apiUrl).protocol !== "https:") {
  throw new Error(
    "Configure EXPO_PUBLIC_API_URL com o endereço HTTPS público da API antes do build.",
  );
}
if (
  process.env.DATABASE_URL ||
  process.env.DATABASE_MIGRATION_URL ||
  process.env.TEAM_ACCESS_TOKEN
) {
  throw new Error(
    "Credenciais do backend não devem ser configuradas no serviço do front.",
  );
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const args of [
  ["ci", "--include=dev"],
  ["run", "build", "--workspace=shared"],
  [
    "exec",
    "--workspace=unifacens-client",
    "--",
    "expo",
    "export",
    "--platform",
    "web",
  ],
]) {
  const result = spawnSync(npm, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
