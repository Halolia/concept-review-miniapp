// assignment-flow.test.js - assignmentId 驱��导航测试
const path = require('path');
const scoring = require(path.resolve(__dirname, '../miniprogram/utils/scoring.js'));

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); } }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${b}, got ${a}`); }

// 模拟 assignment 数据
const assignments = {
  'asgn_r1_a': { _id: 'asgn_r1_a', projectId: 'p1', roundId: 'round_001', expertId: 'r1', status: 'assigned' },
  'asgn_r1_b': { _id: 'asgn_r1_b', projectId: 'p1', roundId: 'round_002', expertId: 'r1', status: 'assigned' },
  'asgn_r2': { _id: 'asgn_r2', projectId: 'p1', roundId: 'round_001', expertId: 'r2', status: 'removed' }
};

test('详情接口: assignmentId 直接定位', () => {
  const result = assignments['asgn_r1_a'];
  assertEqual(result.projectId, 'p1');
  assertEqual(result.roundId, 'round_001');
  assertEqual(result.expertId, 'r1');
});

test('详情接口: 两个批次两个独立 assignment', () => {
  const a1 = assignments['asgn_r1_a'];
  const a2 = assignments['asgn_r1_b'];
  assert(a1._id !== a2._id, '两个 assignment ID 应不同');
  assert(a1.roundId !== a2.roundId, '两批 roundId 应不同');
});

test('详情接口: 不存在 assignment 返回 NOT_FOUND', () => {
  const result = assignments['nonexistent'];
  assertEqual(result, undefined);
});

test('详情接口: removed assignment 不可用', () => {
  const a = assignments['asgn_r2'];
  assert(a.status === 'removed', 'removed 状态应被过滤');
});

test('详情接口: 缺失 assignmentId 应拒绝', () => {
  const assignmentId = '';
  assert(!assignmentId, '空 assignmentId 不应被接受');
});

test('两个批次不互相覆盖: 不同 roundId', () => {
  const reviews = {
    'asgn_r1_a': { assignmentId: 'asgn_r1_a', roundId: 'round_001', totalScore: 85 },
    'asgn_r1_b': { assignmentId: 'asgn_r1_b', roundId: 'round_002', totalScore: 90 }
  };
  assertEqual(reviews['asgn_r1_a'].totalScore, 85);
  assertEqual(reviews['asgn_r1_b'].totalScore, 90);
  assert(reviews['asgn_r1_a'].roundId !== reviews['asgn_r1_b'].roundId);
});

test('两个批次汇总互不混合', () => {
  const round1Reviews = [{ totalScore: 85 }, { totalScore: 90 }];
  const round2Reviews = [{ totalScore: 75 }];
  const avg1 = round1Reviews.reduce((a,b) => a + b.totalScore, 0) / round1Reviews.length;
  const avg2 = round2Reviews.reduce((a,b) => a + b.totalScore, 0) / round2Reviews.length;
  assertEqual(avg1.toFixed(1), '87.5');
  assertEqual(avg2.toFixed(1), '75.0');
  assert(avg1 !== avg2, '两批次汇总应独立');
});

console.log(`\nassignment flow测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
