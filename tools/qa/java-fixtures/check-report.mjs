import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('./', import.meta.url);
const report = new URL('target/spotbugsXml.xml', root);
const verifier = fileURLToPath(new URL('checker/ReportVerifier.java', root));

// Only the verifier runs. Fixture classes are never on its classpath or imported.
// JDK XML parsing avoids a dependency or an incomplete handwritten Node XML parser.
export function checkXml(xml) {
  const result = spawnSync('java', ['--source', '25', verifier], {
    cwd: fileURLToPath(root),
    input: xml,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.signal || !result.stdout) {
    return { status: 1, output: 'checkerFailures=1\n' };
  }
  return { status: result.status === 0 ? 0 : 1, output: result.stdout };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = checkXml(readFileSync(report));
    process.stdout.write(result.output);
    process.exitCode = result.status;
  } catch {
    console.log('checkerFailures=1');
    process.exitCode = 1;
  }
}
