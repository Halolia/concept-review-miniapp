// 测试运行器 — 使用 Node 原生 assert
const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'scoring.test.js',
  'request-error.test.js',
  'summary.test.js',
  'round.test.js',
  'assignment-flow.test.js',
  'review-state.test.js',
  'leader-permission.test.js',
  'openid.test.js',
  'multi-round.test.js',
];

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of tests) {
  console.log(`\n\u2501\u2501\u2501 ${testFile} \u2501\u2501\u2501`);
  try {
    execSync(`node "${path.join(__dirname, testFile)}"`, {
      cwd: __dirname,
      stdio: 'inherit'
    });
    totalPassed++;
  } catch (e) {
    totalFailed++;
  }
}

console.log(`\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
console.log(`\u6d4b\u8bd5\u6587\u4ef6: ${totalPassed} \u901a\u8fc7, ${totalFailed} \u5931\u8d25`);
console.log(`\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);

process.exit(totalFailed > 0 ? 1 : 0);
