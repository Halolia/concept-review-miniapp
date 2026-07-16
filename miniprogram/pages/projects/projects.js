const { isAdmin } = require('../../services/authService');
const { adminListProjects } = require('../../services/projectService');
const { expertListAssignments } = require('../../services/assignmentService');
const { adminGetSummary } = require('../../services/summaryService');
const { getGrade } = require('../../utils/scoring');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    role: 'expert', filter: 'all', filteredProjects: [], allProjects: [], loading: true
  },

  onLoad(options) { if (options.status) this.setData({ filter: options.status }); },

  async onShow() {
    this.setData({ role: isAdmin() ? 'admin' : 'expert' });
    await this.loadProjects();
  },

  async loadProjects() {
    this.setData({ loading: true });
    try {
      if (this.data.role === 'admin') await this.loadAdminProjects();
      else await this.loadExpertProjects();
    } finally { this.setData({ loading: false }); }
  },

  async loadAdminProjects() {
    const projects = await adminListProjects();
    let summary = { rankings: [] };
    try { summary = await adminGetSummary(); } catch (e) {}
    const map = {}; (summary.rankings || []).forEach(r => { map[r.projectId] = r; });

    const enriched = projects.map(p => {
      const s = map[p._id] || {};
      const sc = s.submittedCount || 0;
      const ta = s.totalAssignments || 0;
      let status = s.reviewStatus || '未分配';
      let cls = 'tag-warn';
      if (status === '已完成' || status === '已关闭') cls = 'tag-good';
      else if (status === '评审中') cls = 'tag-pending';
      return { ...p, reviewStatus: status, reviewStatusLabel: status, reviewStatusClass: cls,
        lastScore: ta > 0 ? `${sc}/${ta} 已提交` : (s.avgScore !== '-' ? `${s.avgScore}（均）` : null),
        gradeLabel: s.gradeLabel || null, gradeColor: s.gradeColor || null,
        submittedCount: sc, totalAssignments: ta };
    });
    this.setData({ allProjects: enriched }); this.applyFilter();
  },

  async loadExpertProjects() {
    const assignments = await expertListAssignments();
    const enriched = assignments.map(a => {
      const p = a.project || {};
      const r = a.review;
      const round = a.round || {};
      let status = a.status, label = a.status, cls = 'tag-pending';
      switch (a.status) {
        case 'assigned': label = '待评审'; break;
        case 'draft': label = '草稿'; break;
        case 'submitted': label = '已提交'; cls = 'tag-good'; break;
        case 'resubmitted': label = '已重提交'; cls = 'tag-good'; break;
        case 'returned': label = '已退回'; cls = 'tag-warn'; break;
        case 'locked': label = '已锁定'; cls = 'tag-good'; break;
        case 'closed_unsubmitted': label = '已截止未提交'; cls = 'tag-warn'; break;
      }
      const grade = r ? getGrade(r.totalScore) : null;
      return {
        _id: p._id || a.projectId, name: p.name || '', institution: p.institution || '', leader: p.leader || '',
        assignmentId: a._id, reviewStatus: status, reviewStatusLabel: label, reviewStatusClass: cls,
        lastScore: r ? r.totalScore : null, gradeLabel: grade ? grade.label : null, gradeColor: grade ? grade.color : null,
        isReturned: a.status === 'returned', roundName: round.name || '', roundId: a.roundId
      };
    });
    this.setData({ allProjects: enriched }); this.applyFilter();
  },

  setFilter(e) { this.setData({ filter: e.currentTarget.dataset.filter }); this.applyFilter(); },

  applyFilter() {
    const { allProjects, filter } = this.data;
    let filtered;
    if (filter === 'pending') filtered = allProjects.filter(p => ['待评审', '草稿', '已退回', 'assigned', 'draft', 'returned', '评审中'].includes(p.reviewStatusLabel || p.reviewStatus || ''));
    else if (filter === 'done') filtered = allProjects.filter(p => ['已提交', '已重提交', '已锁定', '已完成', '已关闭', 'submitted', 'resubmitted', 'locked', 'closed_unsubmitted'].includes(p.reviewStatusLabel || p.reviewStatus));
    else if (filter === 'returned') filtered = allProjects.filter(p => (p.reviewStatusLabel || p.reviewStatus) === '已退回' || p.reviewStatus === 'returned' || p.isReturned);
    else filtered = allProjects;
    this.setData({ filteredProjects: filtered });
  },

  goDetail(e) {
    const { id, name, assignmentId } = e.currentTarget.dataset;
    if (this.data.role === 'admin') {
      const p = this.data.allProjects.find(x => x._id === id);
      if (p && (p.submittedCount || 0) > 0) {
        wx.navigateTo({ url: `/pages/result/result?projectId=${id}&projectName=${encodeURIComponent(name || '')}` });
      } else {
        wx.showToast({ title: '暂无评审记录', icon: 'none' });
      }
    } else {
      // 专家：携带 assignmentId
      wx.navigateTo({
        url: `/pages/project-detail/project-detail?assignmentId=${assignmentId}&projectId=${id}&projectName=${encodeURIComponent(name || '')}`
      });
    }
  }
});
