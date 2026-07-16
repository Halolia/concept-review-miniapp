/**
 * 评分测试
 * 运行：node tests/scoring.test.js
 */
const path = require('path');
const scoring = require(path.resolve(__dirname, '../miniprogram/utils/scoring.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${b}, got ${a}`); }

// ═══ 满分合计检查 ═══
test('15项满分合计 = 100', () => {
  const sum = Object.values(scoring.SCORING_ITEMS).reduce((s, item) => s + item.maxScore, 0);
  assertEqual(sum, 100, `满分合计=${sum}`);
});

// ═══ 等级计算 ═══
test('等级：100分=优秀', () => assertEqual(scoring.getGrade(100).label, '优秀'));
test('等级：90分=优秀', () => assertEqual(scoring.getGrade(90).label, '优秀'));
test('等级：80分=良好', () => assertEqual(scoring.getGrade(80).label, '良好'));
test('等级：89.5分=良好', () => assertEqual(scoring.getGrade(89.5).label, '良好'));
test('等级：71分=一般', () => assertEqual(scoring.getGrade(71).label, '一般'));
test('等级：79.9分=一般', () => assertEqual(scoring.getGrade(79.9).label, '一般'));
test('等级：70分=不推荐', () => assertEqual(scoring.getGrade(70).label, '不推荐'));
test('等级：0分=不推荐', () => assertEqual(scoring.getGrade(0).label, '不推荐'));

// ═══ 校验 0~100 范围 ═══
function makeScores(val) {
  const s = {};
  Object.keys(scoring.SCORING_ITEMS).forEach(k => { s[k] = val; });
  return s;
}

function makePartialScores(vals) {
  const s = {};
  const keys = Object.keys(scoring.SCORING_ITEMS);
  // 每个 key 分配不同的值，确保总和在正确范围
  keys.forEach((k, i) => { s[k] = Math.min(vals[i] || 0, scoring.SCORING_ITEMS[k].maxScore); });
  return s;
}

test('总分0分：合法', () => {
  const r = scoring.validateAndCalculate(makeScores(0));
  assert(r.ok, '应合法');
  assertEqual(r.totalScore, 0);
  assertEqual(r.grade, '不推荐');
});

test('总分70分：合法', () => {
  // 70/15 ≈ 4.67 大部分项给5，所以总分要合理分配
  const s = {};
  Object.keys(scoring.SCORING_ITEMS).forEach((k, i) => {
    const max = scoring.SCORING_ITEMS[k].maxScore;
    if (max >= 5) s[k] = 4;
    else s[k] = 3;
  });
  // 调整到正好 70
  let total = Object.values(s).reduce((a, b) => a + b, 0);
  if (total !== 70) {
    // 微调第一个有 maxScore>=5 的项
    for (const k of Object.keys(s)) {
      const diff = 70 - total;
      if (diff !== 0 && scoring.SCORING_ITEMS[k].maxScore >= s[k] + diff) {
        s[k] += diff;
        break;
      }
    }
  }
  const r = scoring.validateAndCalculate(s);
  assert(r.ok, '应合法');
  assertEqual(r.totalScore, 70);
  assertEqual(r.grade, '不推荐');
});

test('总分100分：合法', () => {
  const s = {};
  Object.keys(scoring.SCORING_ITEMS).forEach(k => { s[k] = scoring.SCORING_ITEMS[k].maxScore; });
  const r = scoring.validateAndCalculate(s);
  assert(r.ok, '应合法');
  assertEqual(r.totalScore, 100);
  assertEqual(r.grade, '优秀');
});

test('总分85分：合法-良好', () => {
  // 14项给5分，1项15分给15 = 85
  const keys = Object.keys(scoring.SCORING_ITEMS);
  const s = {};
  keys.forEach(k => {
    if (scoring.SCORING_ITEMS[k].maxScore === 15) s[k] = 15;
    else s[k] = 5;
  });
  const r = scoring.validateAndCalculate(s);
  assert(r.ok, '应合法');
  assertEqual(r.totalScore, 85);
  assertEqual(r.grade, '良好');
});

test('缺少评分项：拒绝', () => {
  const s = { economicSignificance: 3 };
  const r = scoring.validateAndCalculate(s);
  assert(!r.ok, '应拒绝');
});

test('负数：拒绝', () => {
  const s = makeScores(0);
  s.economicSignificance = -1;
  const r = scoring.validateAndCalculate(s);
  assert(!r.ok, '应拒绝');
});

test('超过满分：拒绝', () => {
  const s = makeScores(0);
  s.economicSignificance = 6;
  const r = scoring.validateAndCalculate(s);
  assert(!r.ok, '应拒绝');
});

test('非数字：拒绝', () => {
  const s = makeScores(0);
  s.economicSignificance = 'abc';
  const r = scoring.validateAndCalculate(s);
  assert(!r.ok, '应拒绝');
});

// ═══ 客户端计算 ═══
test('calcTotal 0分', () => assertEqual(scoring.calcTotal(makeScores(0)).totalScore, 0));
test('calcTotal 带非数字', () => {
  const s = makeScores(0);
  s.economicSignificance = 'not a number';
  assertEqual(scoring.calcTotal(s).totalScore, 0);
});

// ═══ 进度条颜色 ═══
test('getBarColor: 高分=绿色', () => assertEqual(scoring.getBarColor(9, 10), '#07c160'));
test('getBarColor: 中分=蓝色', () => assertEqual(scoring.getBarColor(7, 10), '#1989fa'));
test('getBarColor: 低分=橙色', () => assertEqual(scoring.getBarColor(4, 10), '#ff976a'));
test('getBarColor: 极低=红色', () => assertEqual(scoring.getBarColor(1, 10), '#ee0a24'));
test('getBarColor: maxScore=0', () => assertEqual(scoring.getBarColor(5, 0), '#e5e5e5'));

console.log(`\n评分测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
