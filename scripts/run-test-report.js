import { spawnSync } from 'node:child_process';

const sections = [
  { label: 'UNIT TESTS', script: 'test:unit' },
  { label: 'INTEGRATION TESTS', script: 'test:integration' },
  { label: 'UI TESTS', script: 'test:ui' },
];

function divider(title) {
  const pad = '='.repeat(Math.max(8, 72 - title.length));
  return `\n${title} ${pad}`;
}

let hasFailure = false;

console.log('\nMindScribe Test Report');
console.log('Generated via npm run test:report');

for (const section of sections) {
  console.log(divider(section.label));

  const result = spawnSync('npm', ['run', section.script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    hasFailure = true;
    console.log(`\n[FAILED] ${section.label}`);
  } else {
    console.log(`\n[PASSED] ${section.label}`);
  }
}

console.log('\n' + '='.repeat(80));
if (hasFailure) {
  console.log('Test report completed with failures.');
  process.exit(1);
}

console.log('Test report completed successfully.');
