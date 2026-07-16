/**
 * 汇总计算测试
 * 运行：node tests/summary.test.js
 */

const assert = require('assert');
const path = require('path');
const scoring = require(path.resolve(__dirname, '../miniprogram/utils/scoring.js'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ═══ 被测函数（从云函数 index.js 提取的纯逻辑） ═══

/**
 * buildSummary — 与云函数 adminGetSummary 逻辑一致的纯函数
 */
function buildSummary(projects, reviews, assignments, round) {
  const projectMap = {};
  projects.forEach(p => { projectMap[p._id] = p; });

  // 有效评审：排除无效状态
  const validReviews = reviews.filter(r => !['invalidated'].includes(r.status));

  // 按项目聚合有效评分（排除 removed 指派）
  const reviewByProject = {};  // projectId → [scores]
  const fundingByProject = {}; // projectId → [fundings]
  validReviews.forEach(r => {
    if (!reviewByProject[r.projectId]) reviewByProject[r.projectId] = [];
    reviewByProject[r.projectId].push(r.totalScore);
    if (!fundingByProject[r.projectId]) fundingByProject[r.projectId] = [];
    fundingByProject[r.projectId].push(Number(r.recommendedFunding) || 0);
  });

  // 按项目聚合指派（排除 removed）
  const assignmentByProject = {};
  const submittedByProject = {};
  assignments.forEach(a => {
    if (a.status === 'removed') return;
    if (!assignmentByProject[a.projectId]) assignmentByProject[a.projectId] = 0;
    if (!submittedByProject[a.projectId]) submittedByProject[a.projectId] = 0;
    assignmentByProject[a.projectId]++;
    if (['submitted', 'resubmitted', 'locked'].includes(a.status)) submittedByProject[a.projectId]++;
  });

  const isClosed = round && round.status === 'closed';
  const rankings = [];

  for (const project of projects) {
    const pid = project._id;
    const totalAssignments = assignmentByProject[pid] || 0;
    const submittedCount = submittedByProject[pid] || 0;
    const scores = reviewByProject[pid] || [];
    const fundings = fundingByProject[pid] || [];

    let reviewStatus;
    if (totalAssignments === 0) reviewStatus = '\u672a\u5206\u914d';
    else if (submittedCount === 0) reviewStatus = '\u5f85\u5f00\u59cb';
    else if (submittedCount < totalAssignments) reviewStatus = '\u8bc4\u5ba1\u4e2d';
    else reviewStatus = isClosed ? '\u5df2\u5173\u95ed' : '\u5df2\u5b8c\u6210';

    if (scores.length === 0) {
      rankings.push({
        projectId: pid, projectName: project.name, institution: project.institution || '',
        avgScore: '-', median: '-', minScore: '-', maxScore: '-', range: '-',
        gradeLabel: '-', gradeColor: '#999', avgFunding: '-',
        reviewCount: 0, totalAssignments, submittedCount, reviewStatus,
        isFormalRanking: isClosed && submittedCount === totalAssignments
      });
      continue;
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const mid = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const grade = scoring.getGrade(avg);
    const avgFunding = fundings.length > 0
      ? (fundings.reduce((a, b) => a + b, 0) / fundings.length).toFixed(2)
      : '-';

    rankings.push({
      projectId: pid, projectName: project.name, institution: project.institution || '',
      avgScore: avg.toFixed(1), median: mid.toFixed(1),
      minScore: sorted[0], maxScore: sorted[sorted.length - 1],
      range: (sorted[sorted.length - 1] - sorted[0]).toFixed(1),
      gradeLabel: grade.label, gradeColor: grade.color, avgFunding,
      reviewCount: submittedCount, totalAssignments, submittedCount, reviewStatus,
      isFormalRanking: isClosed && submittedCount === totalAssignments
    });
  }

  // 排序：有评分在前（降序），无评分在后
  rankings.sort((a, b) => {
    if (a.avgScore === '-') return 1;
    if (b.avgScore === '-') return -1;
    return parseFloat(b.avgScore) - parseFloat(a.avgScore);
  });
  rankings.forEach((r, i) => { r.rank = i + 1; });

  const totalProjects = projects.length;
  const totalReviews = validReviews.length;
  const allScores = rankings.filter(r => r.avgScore !== '-').map(r => parseFloat(r.avgScore));
  const avgAll = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
    : '-';

  return { totalProjects, totalReviews, avgScore: avgAll, rankings, isClosed };
}

// ═══ 辅助函数 ═══

function makeProject(id, name) {
  return { _id: id, name, institution: '' };
}

function makeAssignment(id, projectId, roundId, expertId, status) {
  return { _id: id, projectId, roundId, expertId, status };
}

function makeReview(id, projectId, roundId, assignmentId, totalScore, recommendedFunding, status) {
  return { _id: id, projectId, roundId, assignmentId, totalScore, recommendedFunding: recommendedFunding || 0, status };
}

function makeRound(id, name, status) {
  return { _id: id, name, status };
}

// ═══ 评审状态判断 ═══

test('评审状态: 0/3 指派已提交 → 待开始', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'assigned'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'assigned'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'draft'),
  ];
  const reviews = [];
  const round = makeRound('r1', '第一批评审', 'open');
  const sum = buildSummary(projects, reviews, assignments, round);
  assert.strictEqual(sum.rankings[0].reviewStatus, '待开始');
  assert.strictEqual(sum.rankings[0].submittedCount, 0);
  assert.strictEqual(sum.rankings[0].totalAssignments, 3);
});

test('评审状态: 1/3 已提交 → 评审中', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'assigned'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'draft'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 85, 100, 'submitted'),
  ];
  const round = makeRound('r1', '第一批评审', 'open');
  const sum = buildSummary(projects, reviews, assignments, round);
  assert.strictEqual(sum.rankings[0].reviewStatus, '评审中');
  assert.strictEqual(sum.rankings[0].submittedCount, 1);
});

test('评审状态: 3/3 已提交 批次 open → 已完成', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 80, 150, 'submitted'),
    makeReview('r3', 'p1', 'r1', 'a3', 70, 100, 'submitted'),
  ];
  const round = makeRound('r1', '第一批评审', 'open');
  const sum = buildSummary(projects, reviews, assignments, round);
  assert.strictEqual(sum.rankings[0].reviewStatus, '已完成');
  assert.strictEqual(sum.rankings[0].submittedCount, 3);
});

test('评审状态: 3/3 已提交 批次 closed → 已关闭', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 80, 150, 'submitted'),
    makeReview('r3', 'p1', 'r1', 'a3', 70, 100, 'submitted'),
  ];
  const round = makeRound('r1', '第一批评审', 'closed');
  const sum = buildSummary(projects, reviews, assignments, round);
  assert.strictEqual(sum.rankings[0].reviewStatus, '已关闭');
  assert.strictEqual(sum.rankings[0].isFormalRanking, true);
});

test('评审状态: removed 指派不计入总数', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'removed'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 80, 150, 'submitted'),
  ];
  const round = makeRound('r1', '第一批评审', 'open');
  const sum = buildSummary(projects, reviews, assignments, round);
  assert.strictEqual(sum.rankings[0].totalAssignments, 2);
  assert.strictEqual(sum.rankings[0].submittedCount, 2);
  assert.strictEqual(sum.rankings[0].reviewStatus, '已完成');
});

test('invalidated 评审不计入评分统计', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 50, 300, 'invalidated'), // 应被忽略
  ];
  const round = makeRound('r1', '第一批评审', 'open');
  const sum = buildSummary(projects, reviews, assignments, round);
  // 只有 1 条有效评审
  assert.strictEqual(sum.totalReviews, 1);
  assert.strictEqual(sum.rankings[0].avgScore, '90.0');
});

test('不同 roundId 的指派不混合', () => {
  const projects = [makeProject('p1', '项目A')];
  // 只在 round_001 下有指派
  const assignments = [
    makeAssignment('a1', 'p1', 'round_001', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'round_001', 'e2', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'round_001', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'round_001', 'a2', 80, 150, 'submitted'),
  ];
  // 如果只按 round_001 筛选，应该计入 2 条
  const filteredAssignments = assignments.filter(a => a.roundId === 'round_001');
  const filteredReviews = reviews.filter(r => r.roundId === 'round_001');
  const round = makeRound('round_001', '第一批评审', 'open');
  const sum = buildSummary(projects, filteredReviews, filteredAssignments, round);
  assert.strictEqual(sum.rankings[0].totalAssignments, 2);
  assert.strictEqual(sum.rankings[0].submittedCount, 2);
  assert.strictEqual(sum.rankings[0].avgScore, '85.0');
});

test('不同 roundId 下仅部分提交的评审不被另一批次计入', () => {
  const projects = [makeProject('p1', '项目A')];
  // round_001 有 2 条指派均提交
  const asgn_001 = [
    makeAssignment('a1', 'p1', 'round_001', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'round_001', 'e2', 'submitted'),
  ];
  const rev_001 = [
    makeReview('r1', 'p1', 'round_001', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'round_001', 'a2', 80, 150, 'submitted'),
  ];
  // round_002 有 2 条指派，仅 1 条提交
  const asgn_002 = [
    makeAssignment('a3', 'p1', 'round_002', 'e1', 'submitted'),
    makeAssignment('a4', 'p1', 'round_002', 'e2', 'assigned'),
  ];
  const rev_002 = [
    makeReview('r3', 'p1', 'round_002', 'a3', 70, 300, 'submitted'),
  ];

  // 查询 round_002 时，应看到评审中，而不会看到 round_001 的已完成
  const sum = buildSummary(projects, rev_002, asgn_002, makeRound('round_002', '第二批评审', 'open'));
  assert.strictEqual(sum.rankings[0].reviewStatus, '评审中');
  assert.strictEqual(sum.rankings[0].totalAssignments, 2);
  assert.strictEqual(sum.rankings[0].submittedCount, 1);
  assert.strictEqual(sum.rankings[0].avgScore, '70.0');
});

// ═══ 中位数计算 ═══

test('中位数: 奇数个评分', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 60, 150, 'submitted'),
    makeReview('r3', 'p1', 'r1', 'a3', 80, 100, 'submitted'),
  ];
  // 排序 60, 80, 90 → 中位数=80
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].median, '80.0');
});

test('中位数: 偶数个评分', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'submitted'),
    makeAssignment('a4', 'p1', 'r1', 'e4', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 90, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 60, 150, 'submitted'),
    makeReview('r3', 'p1', 'r1', 'a3', 80, 100, 'submitted'),
    makeReview('r4', 'p1', 'r1', 'a4', 70, 120, 'submitted'),
  ];
  // 排序 60, 70, 80, 90 → 中位数=(70+80)/2=75
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.median, undefined); // rankings 层面才有
  assert.strictEqual(sum.rankings[0].median, '75.0');
});

test('中位数: 单个评分', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted')];
  const reviews = [makeReview('r1', 'p1', 'r1', 'a1', 85, 100, 'submitted')];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].median, '85.0');
});

test('中位数: 无评分时显示为 "-"', () => {
  const projects = [makeProject('p1', '项目A')];
  const sum = buildSummary(projects, [], [], null);
  assert.strictEqual(sum.rankings[0].median, '-');
});

// ═══ 极差计算 ═══

test('极差: 最高-最低', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
    makeAssignment('a3', 'p1', 'r1', 'e3', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 95, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 60, 150, 'submitted'),
    makeReview('r3', 'p1', 'r1', 'a3', 80, 100, 'submitted'),
  ];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].range, '35.0'); // 95-60=35
  assert.strictEqual(sum.rankings[0].minScore, 60);
  assert.strictEqual(sum.rankings[0].maxScore, 95);
});

test('极差: 所有评分相同 → 0', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 80, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 80, 150, 'submitted'),
  ];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].range, '0.0');
});

// ═══ 平均经费 ═══

test('平均经费: 多条经费求平均', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 80, 200, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 80, 100, 'submitted'),
  ];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].avgFunding, '150.00'); // (200+100)/2
});

test('平均经费: 包含 0 经费', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p1', 'r1', 'e2', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 80, 0, 'submitted'),
    makeReview('r2', 'p1', 'r1', 'a2', 80, 300, 'submitted'),
  ];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].avgFunding, '150.00');
});

test('平均经费: 无评分时为 "-"', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [makeAssignment('a1', 'p1', 'r1', 'e1', 'assigned')];
  const sum = buildSummary(projects, [], assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].avgFunding, '-');
});

// ═══ 全部未分配 ═══

test('评审状态: 无指派显示"未分配"', () => {
  const projects = [makeProject('p1', '项目A')];
  const sum = buildSummary(projects, [], [], null);
  assert.strictEqual(sum.rankings[0].reviewStatus, '未分配');
  assert.strictEqual(sum.rankings[0].totalAssignments, 0);
});

// ═══ 等级标签通过 scoring.getGrade 计算 ═══

test('等级标签: 平均分 95 分为优秀', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted')];
  const reviews = [makeReview('r1', 'p1', 'r1', 'a1', 95, 100, 'submitted')];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].gradeLabel, '优秀');
});

test('等级标签: 平均分 70 分为不推荐', () => {
  const projects = [makeProject('p1', '项目A')];
  const assignments = [makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted')];
  const reviews = [makeReview('r1', 'p1', 'r1', 'a1', 70, 100, 'submitted')];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].gradeLabel, '不推荐');
});

// ═══ 排名排序 ═══

test('排名: 高分在前', () => {
  const projects = [
    makeProject('p1', '项目A'),
    makeProject('p2', '项目B'),
    makeProject('p3', '项目C'),
  ];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p2', 'r1', 'e2', 'submitted'),
    makeAssignment('a3', 'p3', 'r1', 'e3', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 70, 100, 'submitted'),
    makeReview('r2', 'p2', 'r1', 'a2', 90, 200, 'submitted'),
    makeReview('r3', 'p3', 'r1', 'a3', 80, 150, 'submitted'),
  ];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings.length, 3);
  assert.strictEqual(sum.rankings[0].rank, 1);
  assert.strictEqual(sum.rankings[0].projectName, '项目B'); // 90
  assert.strictEqual(sum.rankings[1].rank, 2);
  assert.strictEqual(sum.rankings[1].projectName, '项目C'); // 80
  assert.strictEqual(sum.rankings[2].rank, 3);
  assert.strictEqual(sum.rankings[2].projectName, '项目A'); // 70
});

test('排名: 无评分项目排在最后', () => {
  const projects = [
    makeProject('p1', '项目A'),
    makeProject('p2', '未评项目'),
  ];
  const assignments = [makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted')];
  const reviews = [makeReview('r1', 'p1', 'r1', 'a1', 80, 100, 'submitted')];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.rankings[0].projectName, '项目A');  // 有评分
  assert.strictEqual(sum.rankings[1].avgScore, '-');          // 无评分排后面
});

// ═══ 总体统计 ═══

test('总体统计: totalProjects 正确', () => {
  const projects = [makeProject('p1', 'A'), makeProject('p2', 'B'), makeProject('p3', 'C')];
  const sum = buildSummary(projects, [], [], null);
  assert.strictEqual(sum.totalProjects, 3);
  assert.strictEqual(sum.totalReviews, 0);
  assert.strictEqual(sum.avgScore, '-');
});

test('总体统计: avgScore 为所有项目均分的均值', () => {
  const projects = [makeProject('p1', 'A'), makeProject('p2', 'B')];
  const assignments = [
    makeAssignment('a1', 'p1', 'r1', 'e1', 'submitted'),
    makeAssignment('a2', 'p2', 'r1', 'e2', 'submitted'),
  ];
  const reviews = [
    makeReview('r1', 'p1', 'r1', 'a1', 60, 100, 'submitted'),
    makeReview('r2', 'p2', 'r1', 'a2', 80, 200, 'submitted'),
  ];
  const sum = buildSummary(projects, reviews, assignments, makeRound('r1', 'R1', 'open'));
  assert.strictEqual(sum.avgScore, '70.0'); // (60+80)/2
});

console.log(`\n汇总计算测试: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
