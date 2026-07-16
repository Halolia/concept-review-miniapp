const { getCurrentUserSync, isAdmin } = require('../../services/authService');
const { adminListProjects } = require('../../services/projectService');
const { expertListAssignments } = require('../../services/assignmentService');
const { getGrade } = require('../../utils/scoring');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    role: 'expert',
    filter: 'all',
    filteredProjects: [],
    allProjects: [],
    loading: true
  },

  onLoad(options) {
    if (options.status) this.setData({ filter: options.status });
  },

  async onShow() {
    const role = isAdmin() ? 'admin' : 'expert';
    this.setData({ role });
    await this.loadProjects();
  },

  async loadProjects() {
    this.setData({ loading: true });
    try {
      if (this.data.role === 'admin') {
        await this.loadAdminProjects();
      } else {
        await this.loadExpertProjects();
      }
    } catch (e) {
      console.error('加载项目列表失败:', e);
      this.setData({ loading: false });
    }
  },

  async loadAdminProjects() {
    const projects = await adminListProjects();
    // 通过 summary 获取每个项目的评审状态
    const { adminGetSummary } = require('../../services/summaryService');
    let summaryRes = { rankings: [] };
    try {
      summaryRes = await adminGetSummary();
    } catch (e) {}

    const rankingMap = {};
    (summaryRes.rankings || []).forEach(r => { rankingMap[r.projectId] = r; });

    const enriched = projects.map(p => {
      const stat = rankingMap[p._id] || {};
      const avgScore = stat.avgScore || null;
      const reviewStatus = stat.reviewStatus || '未分配';
      const grade = avgScore ? getGrade(parseFloat(avgScore)) : null;
      let statusClass;
      if (reviewStatus === '已完成') statusClass = 'tag-good';
      else if (reviewStatus === '评审中') statusClass = 'tag-pending';
      else statusClass = 'tag-warn';

      return {
        ...p,
        reviewStatus,
        reviewStatusLabel: reviewStatus,
        reviewStatusClass: statusClass,
        lastScore: stat.reviewCount ? `${stat.reviewCount}/${stat.totalAssignments} 已提交` : (avgScore ? `${avgScore}（均）` : null),
        gradeLabel: grade ? grade.label : null,
        gradeColor: grade ? grade.color : null,
        submittedCount: stat.reviewCount || 0,
        totalAssignments: stat.totalAssignments || 0
      };
    });

    this.setData({ allProjects: enriched, loading: false });
    this.applyFilter();
  },

  async loadExpertProjects() {
    const assignments = await expertListAssignments();
    const enriched = assignments.map(a => {
      const p = a.project || {};
      const review = a.review;
      let reviewStatus = a.status;
      let reviewStatusLabel;
      let statusClass;
      switch (a.status) {
        case 'assigned': reviewStatusLabel = '待评审'; statusClass = 'tag-pending'; break;
        case 'draft': reviewStatusLabel = '草稿'; statusClass = 'tag-pending'; break;
        case 'submitted': reviewStatusLabel = '已提交'; statusClass = 'tag-good'; break;
        case 'resubmitted': reviewStatusLabel = '已重提交'; statusClass = 'tag-good'; break;
        case 'returned': reviewStatusLabel = '已退回'; statusClass = 'tag-warn'; break;
        case 'locked': reviewStatusLabel = '已锁定'; statusClass = 'tag-good'; break;
        default: reviewStatusLabel = a.status; statusClass = 'tag-pending';
      }
      const grade = review ? getGrade(review.totalScore) : null;

      return {
        ...p,
        _id: p._id || a.projectId,
        name: p.name || '',
        institution: p.institution || '',
        leader: p.leader || '',
        assignmentId: a._id,
        reviewStatus,
        reviewStatusLabel,
        reviewStatusClass: statusClass,
        lastScore: review ? review.totalScore : null,
        gradeLabel: grade ? grade.label : null,
        gradeColor: grade ? grade.color : null,
        isReturned: a.status === 'returned'
      };
    });

    this.setData({ allProjects: enriched, loading: false });
    this.applyFilter();
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ filter });
    this.applyFilter();
  },

  applyFilter() {
    const { allProjects, filter } = this.data;
    let filtered;
    if (filter === 'pending') filtered = allProjects.filter(p => ['待评审', '草稿', '已退回', 'assigned', 'draft', 'returned', '评审中', '待开始'].includes(p.reviewStatusLabel || p.reviewStatus || ''));
    else if (filter === 'done') filtered = allProjects.filter(p => ['已提交', '已重提交', '已锁定', '已完成', 'submitted', 'resubmitted', 'locked'].includes(p.reviewStatusLabel || p.reviewStatus));
    else if (filter === 'returned') filtered = allProjects.filter(p => (p.reviewStatusLabel || p.reviewStatus) === '已退回' || p.reviewStatus === 'returned' || p.isReturned);
    else filtered = allProjects;
    this.setData({ filteredProjects: filtered });
  },

  goDetail(e) {
    const { id, name } = e.currentTarget.dataset;
    if (this.data.role === 'admin') {
      // 管理员点项目跳结果详情
      const project = this.data.allProjects.find(p => p._id === id);
      if (project && (project.submittedCount || 0) > 0) {
        wx.navigateTo({ url: `/pages/result/result?projectId=${id}&projectName=${encodeURIComponent(name || '')}` });
      } else {
        wx.showToast({ title: '暂无评审记录', icon: 'none' });
      }
    } else {
      // 专家跳项目详情
      wx.navigateTo({ url: `/pages/project-detail/project-detail?projectId=${id}&projectName=${encodeURIComponent(name || '')}` });
    }
  }
});
