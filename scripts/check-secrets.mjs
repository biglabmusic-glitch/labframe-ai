// Report only the location/category, never the matching credential.
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
const patterns = {
  SupabaseAccessToken: /sbp_[A-Za-z0-9]{25,}/,
  SupabaseSecret: /sb_secret_[A-Za-z0-9_-]{20,}/,
  OpenAISecret: /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/,
  GitHubToken: /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/,
  TelegramToken: /[0-9]{8,13}:[A-Za-z0-9_-]{32,}/,
  PrivateKey: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
};
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(
  Boolean,
);
const findings = [];
for (const file of files) {
  if (
    /\.(onnx|wasm|png|jpe?g|webp|gif|woff2?|zip|mp[34]|bin)$/.test(file) ||
    file.endsWith('package-lock.json')
  ) continue;
  let info;
  try {
    info = await stat(file);
  } catch {
    continue;
  }
  if (info.size > 2_000_000) continue;
  const text = await readFile(file, 'utf8');
  for (const [kind, re] of Object.entries(patterns)) {
    if (re.test(text)) findings.push({ file, kind });
  }
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try {
      if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role') {
        findings.push({ file, kind: 'ServiceRoleJWT' });
      }
    } catch { /* not a JWT */ }
  }
}
console.log(JSON.stringify({ scanned: files.length, findings }));
if (findings.length) process.exitCode = 1;
