// 测试运行器 — 使用 Node 原生 assert
const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'scoring.test.js',
  // 后续测试文件添加在这里
  // 'summary.test.js',
  // 'review-state.test.js',
  // 'permissions.test.js',
  // 'init-data.test.js',
];

let totalPassed = 0;
let totalFailed = 0;

for (const testFile of tests) {
  console.log(`\n━━━ ${testFile} ━━━`);
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

console.log(`\n══════════════════`);
console.log(`测试文件: ${totalPassed} 通过, ${totalFailed} 失败`);
console.log(`══════════════════`);

process.exit(totalFailed > 0 ? 1 : 0);
