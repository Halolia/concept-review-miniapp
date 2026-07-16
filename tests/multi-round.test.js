// multi-round.test.js - 多批次隔离测试
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); } }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${b}, got ${a}`); }

// 模拟两批次数据
const round1Id = 'round_001', round2Id = 'round_002';
const expertId = 'expert_x';
const projectId = 'project_a';

const allAssignments = [
  { _id: 'a1', projectId, roundId: round1Id, expertId, status: 'submitted' },
  { _id: 'a2', projectId, roundId: round2Id, expertId, status: 'draft' }
];

const allReviews = [
  { assignmentId: 'a1', roundId: round1Id, totalScore: 85, status: 'submitted' },
  { assignmentId: 'a2', roundId: round2Id, totalScore: 0, status: 'draft' }
];

function filterByRound(roundId) {
  return {
    assignments: allAssignments.filter(a => a.roundId === roundId),
    reviews: allReviews.filter(r => r.roundId === roundId && r.status === 'submitted')
  };
}

test('同一专家两批次两个 assignment ID', () => {
  assertEqual(allAssignments[0]._id, 'a1');
  assertEqual(allAssignments[1]._id, 'a2');
  assert(allAssignments[0]._id !== allAssignments[1]._id);
});

test('按 roundId 过滤 assignment', () => {
  const r1 = filterByRound(round1Id);
  assertEqual(r1.assignments.length, 1);
  assertEqual(r1.assignments[0].roundId, round1Id);
});

test('按 roundId 过滤只包含 submitted 的 review', () => {
  const r1 = filterByRound(round1Id);
  assertEqual(r1.reviews.length, 1);
  assertEqual(r1.reviews[0].totalScore, 85);
});

test('第二批次不包含第一批提交的 review', () => {
  const r2 = filterByRound(round2Id);
  assertEqual(r2.reviews.length, 0, 'round2 不应包含 round1 的 submitted review');
});

test('draft 不计入有效评审', () => {
  const r2reviews = filterByRound(round2Id).reviews;
  assertEqual(r2reviews.length, 0);
});

test('汇总按 roundId 隔离: round1 平均分', () => {
  const r1revs = filterByRound(round1Id).reviews;
  const avg = r1revs.length > 0 ? r1revs.reduce((a,b) => a + b.totalScore, 0) / r1revs.length : 0;
  assertEqual(avg, 85);
});

test('汇总按 roundId 隔离: round2 无有效评分', () => {
  const r2revs = filterByRound(round2Id).reviews;
  assertEqual(r2revs.length, 0);
});

test('不同批次数据不混合', () => {
  const r1 = filterByRound(round1Id);
  const r2 = filterByRound(round2Id);
  assert(r1.assignments.every(a => a.roundId === round1Id));
  assert(r2.assignments.every(a => a.roundId === round2Id));
});

console.log(`\n多批次隔离测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
