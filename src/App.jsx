import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================
// CONFIG & CONSTANTS
// ============================================================
const SUPABASE_URL = "https://grnqsteorvdyxsvzglcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdybnFzdGVvcnZkeXhzdnpnbGNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Njk1MTQsImV4cCI6MjA5MTM0NTUxNH0.N1yISdQSSgHMHfQ8HNMM4jGRi-8zLWI_Aw4b6eSeX8c";

const COLUMNS = [
  { id: "todo", title: "To Do", icon: "○", color: "#94a3b8" },
  { id: "in_progress", title: "In Progress", icon: "◐", color: "#f59e0b" },
  { id: "in_review", title: "In Review", icon: "◑", color: "#8b5cf6" },
  { id: "done", title: "Done", icon: "●", color: "#22c55e" },
];

const PRIORITIES = {
  low: { label: "Low", color: "#64748b", bg: "#f1f5f9" },
  normal: { label: "Normal", color: "#3b82f6", bg: "#eff6ff" },
  high: { label: "High", color: "#ef4444", bg: "#fef2f2" },
};

const MEMBER_COLORS = [
  "#6366f1","#ec4899","#f59e0b","#22c55e","#06b6d4","#f97316","#8b5cf6","#ef4444",
];

// ============================================================
// SUPABASE CLIENT (minimal, no SDK needed)
// ============================================================
class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.token = null;
    this.userId = null;
  }

  async fetch(path, options = {}) {
    const headers = {
      apikey: this.key,
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...options.headers,
    };
    const res = await fetch(`${this.url}${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.msg || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async signInAnonymously() {
    const stored = localStorage.getItem("sb_session");
    if (stored) {
      try {
        const session = JSON.parse(stored);
        // Try refresh
        const data = await this.fetch("/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        this.token = data.access_token;
        this.userId = data.user.id;
        localStorage.setItem("sb_session", JSON.stringify(data));
        return data.user;
      } catch {
        localStorage.removeItem("sb_session");
      }
    }
    const data = await this.fetch("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({}),
    });
    this.token = data.access_token;
    this.userId = data.user.id;
    localStorage.setItem("sb_session", JSON.stringify(data));
    return data.user;
  }

  async query(table, { select = "*", filters = {}, order } = {}) {
    let params = `select=${encodeURIComponent(select)}`;
    Object.entries(filters).forEach(([k, v]) => {
      params += `&${k}=${encodeURIComponent(v)}`;
    });
    if (order) params += `&order=${encodeURIComponent(order)}`;
    return this.fetch(`/rest/v1/${table}?${params}`, {
      headers: { Prefer: "return=representation" },
    });
  }

  async insert(table, data) {
    return this.fetch(`/rest/v1/${table}`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Prefer: "return=representation" },
    });
  }

  async update(table, id, data) {
    return this.fetch(`/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { Prefer: "return=representation" },
    });
  }

  async delete(table, id) {
    return this.fetch(`/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
    });
  }
}

const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

function getDueStatus(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "Overdue", color: "#ef4444", bg: "#fef2f2" };
  if (diff === 0) return { label: "Today", color: "#f59e0b", bg: "#fffbeb" };
  if (diff <= 2) return { label: `${diff}d left`, color: "#f97316", bg: "#fff7ed" };
  return { label: `${diff}d left`, color: "#64748b", bg: "#f8fafc" };
}

function getInitials(name) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ============================================================
// STYLES (injected via style tag in the component)
// ============================================================
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

  :root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-tertiary: #1a1a26;
    --bg-card: #16161f;
    --bg-hover: #1e1e2a;
    --bg-input: #1a1a26;
    --border-primary: #2a2a3a;
    --border-secondary: #222233;
    --text-primary: #e8e8f0;
    --text-secondary: #9898b0;
    --text-tertiary: #6a6a82;
    --accent: #6366f1;
    --accent-hover: #818cf8;
    --accent-muted: rgba(99,102,241,0.15);
    --danger: #ef4444;
    --success: #22c55e;
    --warning: #f59e0b;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
  }

  * { margin:0; padding:0; box-sizing:border-box; }
  
  body {
    font-family: 'DM Sans', -apple-system, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
  }

  ::selection { background: var(--accent-muted); color: var(--accent-hover); }
  
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-primary); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }

  input, textarea, select, button { font-family: inherit; }

  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideIn { from { opacity:0; transform:translateX(16px); } to { opacity:1; transform:translateX(0); } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes dragFloat { 0%,100%{transform:rotate(-1deg) scale(1.04);} 50%{transform:rotate(1deg) scale(1.06);} }

  .fade-in { animation: fadeIn 0.3s ease forwards; }
  .slide-in { animation: slideIn 0.3s ease forwards; }
  .scale-in { animation: scaleIn 0.2s ease forwards; }

  .skeleton {
    background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-sm);
  }
`;

// ============================================================
// ICON COMPONENTS
// ============================================================
const Icons = {
  Plus: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>,
  Search: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  X: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  Calendar: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  Flag: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  MessageCircle: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Users: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Trash: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  Edit: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Clock: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  Tag: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  ChevronDown: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>,
  Activity: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Send: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  GripVertical: () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" opacity="0.3"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>,
  BarChart: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Filter: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
};


// ============================================================
// MAIN APP COMPONENT
// ============================================================
export default function KanbanApp() {
  // --- State ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [comments, setComments] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [taskLabels, setTaskLabels] = useState([]);

  // UI State
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateTaskForColumn, setShowCreateTaskForColumn] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState(null);
  const [filterLabel, setFilterLabel] = useState(null);
  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [showLabelPanel, setShowLabelPanel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);

  // Drag state
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  // --- Helpers ---
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // --- Data Loading ---
  const loadData = useCallback(async () => {
    try {
      const [t, tm, lb, tl] = await Promise.all([
        supabase.query("tasks", { order: "position.asc,created_at.asc" }),
        supabase.query("team_members", { order: "created_at.asc" }),
        supabase.query("labels", { order: "created_at.asc" }),
        supabase.query("task_labels", { select: "*" }),
      ]);
      setTasks(t || []);
      setTeamMembers(tm || []);
      setLabels(lb || []);
      setTaskLabels(tl || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await supabase.signInAnonymously();
        await loadData();
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  // --- Task CRUD ---
  const createTask = async (taskData) => {
    try {
      const { _labelIds, ...dbData } = taskData;
      const maxPos = tasks.filter((t) => t.status === dbData.status).reduce((m, t) => Math.max(m, t.position || 0), -1);
      const result = await supabase.insert("tasks", { ...dbData, position: maxPos + 1 });
      if (result?.[0]) {
        setTasks((prev) => [...prev, result[0]]);
        // Log activity
        await supabase.insert("activity_log", { task_id: result[0].id, action: "created", details: { title: result[0].title } });
        // Handle labels
        if (_labelIds?.length) {
          for (const lid of _labelIds) {
            await supabase.insert("task_labels", { task_id: result[0].id, label_id: lid });
          }
          const tl = await supabase.query("task_labels", { select: "*" });
          setTaskLabels(tl || []);
        }
        showToast("Task created");
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const updateTask = async (id, updates) => {
    try {
      const result = await supabase.update("tasks", id, updates);
      if (result?.[0]) {
        setTasks((prev) => prev.map((t) => (t.id === id ? result[0] : t)));
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const moveTask = async (taskId, newStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const oldStatus = task.status;
    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await supabase.update("tasks", taskId, { status: newStatus });
      await supabase.insert("activity_log", {
        task_id: taskId,
        action: "status_changed",
        details: { from: oldStatus, to: newStatus },
      });
      showToast(`Moved to ${COLUMNS.find((c) => c.id === newStatus)?.title}`);
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: oldStatus } : t)));
      showToast(e.message, "error");
    }
  };

  const deleteTask = async (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedTask(null);
    try {
      await supabase.delete("tasks", id);
      showToast("Task deleted");
    } catch (e) {
      showToast(e.message, "error");
      await loadData();
    }
  };

  // --- Team Members ---
  const addTeamMember = async (name) => {
    const color = MEMBER_COLORS[teamMembers.length % MEMBER_COLORS.length];
    try {
      const result = await supabase.insert("team_members", { name, color });
      if (result?.[0]) {
        setTeamMembers((prev) => [...prev, result[0]]);
        showToast(`${name} added`);
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const removeTeamMember = async (id) => {
    try {
      await supabase.delete("team_members", id);
      setTeamMembers((prev) => prev.filter((m) => m.id !== id));
      showToast("Member removed");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // --- Labels ---
  const addLabel = async (name, color) => {
    try {
      const result = await supabase.insert("labels", { name, color });
      if (result?.[0]) {
        setLabels((prev) => [...prev, result[0]]);
        showToast(`Label "${name}" created`);
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const removeLabel = async (id) => {
    try {
      await supabase.delete("labels", id);
      setLabels((prev) => prev.filter((l) => l.id !== id));
      setTaskLabels((prev) => prev.filter((tl) => tl.label_id !== id));
      showToast("Label removed");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // --- Comments ---
  const loadComments = async (taskId) => {
    try {
      const c = await supabase.query("comments", { filters: { task_id: `eq.${taskId}` }, order: "created_at.asc" });
      setComments(c || []);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const addComment = async (taskId, content) => {
    try {
      const result = await supabase.insert("comments", { task_id: taskId, content });
      if (result?.[0]) {
        setComments((prev) => [...prev, result[0]]);
        await supabase.insert("activity_log", { task_id: taskId, action: "comment_added", details: {} });
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // --- Activity Log ---
  const loadActivity = async (taskId) => {
    try {
      const a = await supabase.query("activity_log", { filters: { task_id: `eq.${taskId}` }, order: "created_at.desc" });
      setActivityLog(a || []);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // --- Toggle Task Label ---
  const toggleTaskLabel = async (taskId, labelId) => {
    const existing = taskLabels.find((tl) => tl.task_id === taskId && tl.label_id === labelId);
    try {
      if (existing) {
        await supabase.delete("task_labels", existing.id);
        setTaskLabels((prev) => prev.filter((tl) => tl.id !== existing.id));
      } else {
        const result = await supabase.insert("task_labels", { task_id: taskId, label_id: labelId });
        if (result?.[0]) setTaskLabels((prev) => [...prev, result[0]]);
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // --- Filtering ---
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterAssignee && t.assignee_id !== filterAssignee) return false;
      if (filterLabel) {
        const hasLabel = taskLabels.some((tl) => tl.task_id === t.id && tl.label_id === filterLabel);
        if (!hasLabel) return false;
      }
      return true;
    });
  }, [tasks, searchQuery, filterPriority, filterAssignee, filterLabel, taskLabels]);

  // --- Stats ---
  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    overdue: tasks.filter((t) => {
      if (!t.due_date || t.status === "done") return false;
      return new Date(t.due_date + "T00:00:00") < new Date(new Date().toDateString());
    }).length,
  }), [tasks]);

  const activeFiltersCount = [filterPriority, filterAssignee, filterLabel].filter(Boolean).length;

  // --- Drag & Drop ---
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    requestAnimationFrame(() => {
      e.target.style.opacity = "0.4";
    });
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = "1";
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleDrop = (e, columnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedTask) {
      moveTask(draggedTask.id, columnId);
    }
  };

  // --- Render ---
  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} onRetry={() => window.location.reload()} />;

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <header style={{
          borderBottom: "1px solid var(--border-primary)",
          background: "var(--bg-secondary)",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 40,
          backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, color: "#fff",
              }}>K</div>
              <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em" }}>Kanban Board</span>
            </div>

            {/* Stats pills */}
            <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
              {[
                { label: "Total", value: stats.total, color: "var(--text-secondary)" },
                { label: "Done", value: stats.done, color: "#22c55e" },
                ...(stats.overdue > 0 ? [{ label: "Overdue", value: stats.overdue, color: "#ef4444" }] : []),
              ].map((s) => (
                <div key={s.label} style={{
                  padding: "4px 10px", borderRadius: 20,
                  background: "var(--bg-tertiary)", border: "1px solid var(--border-secondary)",
                  fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4,
                }}>
                  <span style={{ color: s.color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--bg-input)", border: "1px solid var(--border-primary)",
              borderRadius: 8, padding: "6px 12px", width: 220,
            }}>
              <Icons.Search />
              <input
                type="text" placeholder="Search tasks..."
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: "none", border: "none", outline: "none",
                  color: "var(--text-primary)", fontSize: 13, width: "100%",
                }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} style={{
                  background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)",
                  display: "flex", padding: 0,
                }}>
                  <Icons.X />
                </button>
              )}
            </div>

            {/* Filter Button */}
            <button onClick={() => setShowFilters(!showFilters)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px",
              background: activeFiltersCount ? "var(--accent-muted)" : "var(--bg-input)",
              border: `1px solid ${activeFiltersCount ? "var(--accent)" : "var(--border-primary)"}`,
              borderRadius: 8, cursor: "pointer",
              color: activeFiltersCount ? "var(--accent-hover)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: 500,
            }}>
              <Icons.Filter />
              Filters
              {activeFiltersCount > 0 && (
                <span style={{
                  background: "var(--accent)", color: "#fff", borderRadius: 10,
                  padding: "0 6px", fontSize: 11, fontWeight: 600, minWidth: 18, textAlign: "center",
                }}>{activeFiltersCount}</span>
              )}
            </button>

            {/* Team Button */}
            <button onClick={() => setShowTeamPanel(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px",
              background: "var(--bg-input)", border: "1px solid var(--border-primary)",
              borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
            }}>
              <Icons.Users /> Team
              {teamMembers.length > 0 && <span style={{ color: "var(--accent-hover)", fontFamily: "'JetBrains Mono', monospace" }}>{teamMembers.length}</span>}
            </button>

            {/* Labels Button */}
            <button onClick={() => setShowLabelPanel(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px",
              background: "var(--bg-input)", border: "1px solid var(--border-primary)",
              borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
            }}>
              <Icons.Tag /> Labels
            </button>

            {/* Create Task */}
            <button onClick={() => { setShowCreateTaskForColumn("todo"); setShowCreateTask(true); }} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
              background: "var(--accent)", border: "none",
              borderRadius: 8, cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 600,
              transition: "all 0.15s",
            }}
              onMouseEnter={(e) => e.target.style.background = "var(--accent-hover)"}
              onMouseLeave={(e) => e.target.style.background = "var(--accent)"}
            >
              <Icons.Plus /> New Task
            </button>
          </div>
        </header>

        {/* Filter Bar */}
        {showFilters && (
          <div className="fade-in" style={{
            padding: "10px 24px", background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-primary)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>Filter by:</span>

            <select value={filterPriority || ""} onChange={(e) => setFilterPriority(e.target.value || null)} style={{
              background: "var(--bg-input)", border: "1px solid var(--border-primary)",
              borderRadius: 6, padding: "4px 8px", color: "var(--text-primary)", fontSize: 12,
            }}>
              <option value="">All Priorities</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>

            {teamMembers.length > 0 && (
              <select value={filterAssignee || ""} onChange={(e) => setFilterAssignee(e.target.value || null)} style={{
                background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 6, padding: "4px 8px", color: "var(--text-primary)", fontSize: 12,
              }}>
                <option value="">All Assignees</option>
                {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}

            {labels.length > 0 && (
              <select value={filterLabel || ""} onChange={(e) => setFilterLabel(e.target.value || null)} style={{
                background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 6, padding: "4px 8px", color: "var(--text-primary)", fontSize: 12,
              }}>
                <option value="">All Labels</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}

            {activeFiltersCount > 0 && (
              <button onClick={() => { setFilterPriority(null); setFilterAssignee(null); setFilterLabel(null); }}
                style={{
                  background: "none", border: "none", color: "var(--accent-hover)",
                  fontSize: 12, cursor: "pointer", fontWeight: 500,
                }}>
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Board */}
        <div style={{
          flex: 1, display: "flex", gap: 16, padding: "20px 24px",
          overflowX: "auto", alignItems: "flex-start",
        }}>
          {COLUMNS.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.id);
            const isOver = dragOverColumn === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, col.id)}
                style={{
                  flex: "1 1 0", minWidth: 280, maxWidth: 360,
                  display: "flex", flexDirection: "column",
                  background: isOver ? "rgba(99,102,241,0.06)" : "transparent",
                  borderRadius: "var(--radius-lg)",
                  border: isOver ? "2px dashed var(--accent)" : "2px dashed transparent",
                  transition: "all 0.2s ease",
                  padding: isOver ? 6 : 0,
                }}
              >
                {/* Column Header */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0 4px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: col.color, fontSize: 16 }}>{col.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: "-0.01em" }}>{col.title}</span>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: "var(--text-tertiary)", fontWeight: 500,
                      background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 4,
                    }}>{columnTasks.length}</span>
                  </div>
                  <button
                    onClick={() => { setShowCreateTaskForColumn(col.id); setShowCreateTask(true); }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-tertiary)", padding: 4, borderRadius: 4,
                      display: "flex", transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                  >
                    <Icons.Plus />
                  </button>
                </div>

                {/* Task Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                  {columnTasks.length === 0 && !isOver && (
                    <div style={{
                      padding: "32px 16px", textAlign: "center",
                      border: "1px dashed var(--border-primary)", borderRadius: "var(--radius-md)",
                      color: "var(--text-tertiary)", fontSize: 13,
                    }}>
                      No tasks yet
                    </div>
                  )}
                  {columnTasks.map((task, i) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      index={i}
                      teamMembers={teamMembers}
                      labels={labels}
                      taskLabels={taskLabels.filter((tl) => tl.task_id === task.id)}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        setSelectedTask(task);
                        loadComments(task.id);
                        loadActivity(task.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Toast */}
        {toast && (
          <div className="scale-in" style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 100,
            padding: "10px 18px", borderRadius: 10,
            background: toast.type === "error" ? "#991b1b" : "#065f46",
            color: "#fff", fontSize: 13, fontWeight: 500,
            boxShadow: "var(--shadow-lg)",
          }}>
            {toast.msg}
          </div>
        )}

        {/* Modals / Panels */}
        {showCreateTask && (
          <CreateTaskModal
            column={showCreateTaskForColumn}
            teamMembers={teamMembers}
            labels={labels}
            onClose={() => setShowCreateTask(false)}
            onCreate={(data) => { createTask(data); setShowCreateTask(false); }}
          />
        )}

        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            teamMembers={teamMembers}
            labels={labels}
            taskLabels={taskLabels.filter((tl) => tl.task_id === selectedTask.id)}
            comments={comments}
            activityLog={activityLog}
            onClose={() => { setSelectedTask(null); setComments([]); setActivityLog([]); }}
            onUpdate={(updates) => {
              updateTask(selectedTask.id, updates);
              setSelectedTask((prev) => ({ ...prev, ...updates }));
            }}
            onDelete={() => deleteTask(selectedTask.id)}
            onAddComment={(content) => addComment(selectedTask.id, content)}
            onToggleLabel={(labelId) => toggleTaskLabel(selectedTask.id, labelId)}
          />
        )}

        {showTeamPanel && (
          <TeamPanel
            members={teamMembers}
            onAdd={addTeamMember}
            onRemove={removeTeamMember}
            onClose={() => setShowTeamPanel(false)}
          />
        )}

        {showLabelPanel && (
          <LabelPanel
            labels={labels}
            onAdd={addLabel}
            onRemove={removeLabel}
            onClose={() => setShowLabelPanel(false)}
          />
        )}
      </div>
    </>
  );
}

// ============================================================
// TASK CARD
// ============================================================
function TaskCard({ task, index, teamMembers, labels, taskLabels, onDragStart, onDragEnd, onClick }) {
  const assignee = teamMembers.find((m) => m.id === task.assignee_id);
  const dueStatus = getDueStatus(task.due_date);
  const cardLabels = taskLabels.map((tl) => labels.find((l) => l.id === tl.label_id)).filter(Boolean);
  const priority = PRIORITIES[task.priority];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="fade-in"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-secondary)",
        borderRadius: "var(--radius-md)",
        padding: 14,
        cursor: "grab",
        transition: "all 0.15s ease",
        animationDelay: `${index * 40}ms`,
        animationFillMode: "backwards",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-primary)";
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-secondary)";
        e.currentTarget.style.background = "var(--bg-card)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Labels */}
      {cardLabels.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {cardLabels.map((l) => (
            <span key={l.id} style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: l.color + "22", color: l.color, letterSpacing: "0.02em",
            }}>{l.name}</span>
          ))}
        </div>
      )}

      {/* Title */}
      <div style={{ fontWeight: 500, fontSize: 13.5, lineHeight: 1.4, marginBottom: 8, letterSpacing: "-0.01em" }}>
        {task.title}
      </div>

      {/* Meta Row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Priority */}
        <span style={{
          padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600,
          background: priority.bg, color: priority.color,
        }}>
          {priority.label}
        </span>

        {/* Due Date */}
        {dueStatus && (
          <span style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600,
            background: dueStatus.bg, color: dueStatus.color,
          }}>
            <Icons.Calendar /> {dueStatus.label}
          </span>
        )}

        {/* Description indicator */}
        {task.description && (
          <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h14"/></svg>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Assignee */}
        {assignee && (
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: assignee.color, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 700, color: "#fff",
            flexShrink: 0,
          }} title={assignee.name}>
            {getInitials(assignee.name)}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CREATE TASK MODAL
// ============================================================
function CreateTaskModal({ column, teamMembers, labels, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [selectedLabels, setSelectedLabels] = useState([]);
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description,
      priority,
      status: column,
      due_date: dueDate || null,
      assignee_id: assigneeId || null,
      _labelIds: selectedLabels,
    });
  };

  return (
    <Overlay onClose={onClose}>
      <div className="scale-in" onClick={(e) => e.stopPropagation()} style={{
        background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-primary)", width: 480, maxWidth: "92vw",
        boxShadow: "var(--shadow-lg)", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>New Task</h3>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "3px 8px", background: "var(--bg-tertiary)", borderRadius: 4 }}>
            {COLUMNS.find((c) => c.id === column)?.title}
          </span>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <input ref={titleRef} placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            style={{
              background: "var(--bg-input)", border: "1px solid var(--border-primary)",
              borderRadius: 8, padding: "10px 12px", color: "var(--text-primary)",
              fontSize: 14, outline: "none", width: "100%",
            }}
            onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
            onBlur={(e) => e.target.style.borderColor = "var(--border-primary)"}
          />
          <textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)}
            rows={3} style={{
              background: "var(--bg-input)", border: "1px solid var(--border-primary)",
              borderRadius: 8, padding: "10px 12px", color: "var(--text-primary)",
              fontSize: 13, outline: "none", resize: "vertical", width: "100%",
            }}
            onFocus={(e) => e.target.style.borderColor = "var(--accent)"}
            onBlur={(e) => e.target.style.borderColor = "var(--border-primary)"}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, display: "block", fontWeight: 500 }}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{
                background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 6, padding: "8px 10px", color: "var(--text-primary)", fontSize: 13, width: "100%",
              }}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, display: "block", fontWeight: 500 }}>Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{
                background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 6, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, width: "100%",
                colorScheme: "dark",
              }} />
            </div>
          </div>
          {teamMembers.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, display: "block", fontWeight: 500 }}>Assignee</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={{
                background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 6, padding: "8px 10px", color: "var(--text-primary)", fontSize: 13, width: "100%",
              }}>
                <option value="">Unassigned</option>
                {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {labels.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, display: "block", fontWeight: 500 }}>Labels</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {labels.map((l) => {
                  const active = selectedLabels.includes(l.id);
                  return (
                    <button key={l.id} onClick={() => setSelectedLabels((prev) => active ? prev.filter((id) => id !== l.id) : [...prev, l.id])}
                      style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                        background: active ? l.color + "33" : "var(--bg-tertiary)",
                        color: active ? l.color : "var(--text-secondary)",
                        border: active ? `1px solid ${l.color}55` : "1px solid var(--border-primary)",
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-primary)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-primary)",
            background: "var(--bg-tertiary)", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", fontWeight: 500,
          }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!title.trim()} style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: title.trim() ? "var(--accent)" : "var(--bg-tertiary)",
            color: title.trim() ? "#fff" : "var(--text-tertiary)",
            fontSize: 13, cursor: title.trim() ? "pointer" : "default", fontWeight: 600,
          }}>Create Task</button>
        </div>
      </div>
    </Overlay>
  );
}

// ============================================================
// TASK DETAIL PANEL (Slide-over)
// ============================================================
function TaskDetailPanel({ task, teamMembers, labels, taskLabels, comments, activityLog, onClose, onUpdate, onDelete, onAddComment, onToggleLabel }) {
  const [tab, setTab] = useState("details");
  const [commentText, setCommentText] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(task.title);
  const [descVal, setDescVal] = useState(task.description || "");
  const [editingDesc, setEditingDesc] = useState(false);

  const assignee = teamMembers.find((m) => m.id === task.assignee_id);
  const dueStatus = getDueStatus(task.due_date);
  const priority = PRIORITIES[task.priority];
  const activeLabels = taskLabels.map((tl) => labels.find((l) => l.id === tl.label_id)).filter(Boolean);

  const handleSendComment = () => {
    if (!commentText.trim()) return;
    onAddComment(commentText.trim());
    setCommentText("");
  };

  return (
    <Overlay onClose={onClose} side>
      <div className="slide-in" onClick={(e) => e.stopPropagation()} style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 520, maxWidth: "100vw",
        background: "var(--bg-secondary)", borderLeft: "1px solid var(--border-primary)",
        display: "flex", flexDirection: "column", zIndex: 60,
        boxShadow: "-8px 0 24px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border-primary)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["details", "comments", "activity"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "5px 12px", borderRadius: 6, border: "none",
                background: tab === t ? "var(--accent-muted)" : "transparent",
                color: tab === t ? "var(--accent-hover)" : "var(--text-tertiary)",
                fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
              }}>{t}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onDelete} style={{
              padding: "6px 10px", borderRadius: 6, border: "1px solid #7f1d1d33",
              background: "#7f1d1d22", color: "#ef4444", cursor: "pointer", display: "flex",
              alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500,
            }}><Icons.Trash /> Delete</button>
            <button onClick={onClose} style={{
              background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)",
              borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "var(--text-secondary)", display: "flex",
            }}><Icons.X /></button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {tab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Title */}
              {editingTitle ? (
                <input value={titleVal} onChange={(e) => setTitleVal(e.target.value)} autoFocus
                  onBlur={() => { if (titleVal.trim()) { onUpdate({ title: titleVal.trim() }); } setEditingTitle(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--accent)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 18, fontWeight: 600, outline: "none" }}
                />
              ) : (
                <h2 onClick={() => setEditingTitle(true)} style={{
                  fontSize: 18, fontWeight: 600, cursor: "text", padding: "4px 0",
                  letterSpacing: "-0.02em", lineHeight: 1.3,
                }}>{task.title}</h2>
              )}

              {/* Status */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COLUMNS.map((col) => (
                  <button key={col.id} onClick={() => onUpdate({ status: col.id })} style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: task.status === col.id ? col.color + "22" : "var(--bg-tertiary)",
                    color: task.status === col.id ? col.color : "var(--text-tertiary)",
                    border: task.status === col.id ? `1px solid ${col.color}44` : "1px solid var(--border-primary)",
                    cursor: "pointer",
                  }}>
                    {col.icon} {col.title}
                  </button>
                ))}
              </div>

              {/* Fields */}
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "12px 16px", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>Priority</span>
                <select value={task.priority} onChange={(e) => onUpdate({ priority: e.target.value })} style={{
                  background: "var(--bg-input)", border: "1px solid var(--border-primary)", borderRadius: 6, padding: "6px 10px", color: "var(--text-primary)", fontSize: 13,
                }}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>

                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>Due Date</span>
                <input type="date" value={task.due_date || ""} onChange={(e) => onUpdate({ due_date: e.target.value || null })} style={{
                  background: "var(--bg-input)", border: "1px solid var(--border-primary)", borderRadius: 6, padding: "6px 10px", color: "var(--text-primary)", fontSize: 13, colorScheme: "dark",
                }} />

                {teamMembers.length > 0 && (
                  <>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>Assignee</span>
                    <select value={task.assignee_id || ""} onChange={(e) => onUpdate({ assignee_id: e.target.value || null })} style={{
                      background: "var(--bg-input)", border: "1px solid var(--border-primary)", borderRadius: 6, padding: "6px 10px", color: "var(--text-primary)", fontSize: 13,
                    }}>
                      <option value="">Unassigned</option>
                      {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </>
                )}
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500, display: "block", marginBottom: 8 }}>Labels</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {labels.map((l) => {
                      const active = taskLabels.some((tl) => tl.label_id === l.id);
                      return (
                        <button key={l.id} onClick={() => onToggleLabel(l.id)} style={{
                          padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                          background: active ? l.color + "33" : "var(--bg-tertiary)",
                          color: active ? l.color : "var(--text-secondary)",
                          border: active ? `1px solid ${l.color}55` : "1px solid var(--border-primary)",
                          cursor: "pointer",
                        }}>{l.name}</button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500, display: "block", marginBottom: 8 }}>Description</span>
                {editingDesc ? (
                  <textarea value={descVal} onChange={(e) => setDescVal(e.target.value)} autoFocus rows={4}
                    onBlur={() => { onUpdate({ description: descVal }); setEditingDesc(false); }}
                    style={{ background: "var(--bg-input)", border: "1px solid var(--accent)", borderRadius: 8, padding: "10px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", width: "100%", resize: "vertical" }}
                  />
                ) : (
                  <div onClick={() => { setDescVal(task.description || ""); setEditingDesc(true); }} style={{
                    background: "var(--bg-input)", border: "1px solid var(--border-primary)", borderRadius: 8,
                    padding: "10px 12px", minHeight: 60, cursor: "text",
                    color: task.description ? "var(--text-primary)" : "var(--text-tertiary)",
                    fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                  }}>
                    {task.description || "Click to add a description..."}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "comments" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {comments.length === 0 && (
                <div style={{ textAlign: "center", padding: 32, color: "var(--text-tertiary)", fontSize: 13 }}>
                  <Icons.MessageCircle /><br />No comments yet
                </div>
              )}
              {comments.map((c) => (
                <div key={c.id} className="fade-in" style={{
                  background: "var(--bg-tertiary)", borderRadius: 8, padding: 12,
                  border: "1px solid var(--border-secondary)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>Guest</span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{c.content}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "activity" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {activityLog.length === 0 && (
                <div style={{ textAlign: "center", padding: 32, color: "var(--text-tertiary)", fontSize: 13 }}>
                  <Icons.Activity /><br />No activity yet
                </div>
              )}
              {activityLog.map((a) => {
                let text = a.action;
                if (a.action === "created") text = "Task created";
                if (a.action === "status_changed") {
                  const from = COLUMNS.find((c) => c.id === a.details?.from)?.title || a.details?.from;
                  const to = COLUMNS.find((c) => c.id === a.details?.to)?.title || a.details?.to;
                  text = `Moved from ${from} → ${to}`;
                }
                if (a.action === "comment_added") text = "Comment added";
                return (
                  <div key={a.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0",
                    borderBottom: "1px solid var(--border-secondary)",
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 6, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 13, color: "var(--text-primary)" }}>{text}</p>
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Comment Input */}
        {tab === "comments" && (
          <div style={{
            padding: "14px 20px", borderTop: "1px solid var(--border-primary)",
            display: "flex", gap: 8,
          }}>
            <input placeholder="Write a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
              style={{
                flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none",
              }}
            />
            <button onClick={handleSendComment} disabled={!commentText.trim()} style={{
              padding: "8px 12px", borderRadius: 8, border: "none",
              background: commentText.trim() ? "var(--accent)" : "var(--bg-tertiary)",
              color: commentText.trim() ? "#fff" : "var(--text-tertiary)",
              cursor: commentText.trim() ? "pointer" : "default", display: "flex", alignItems: "center",
            }}><Icons.Send /></button>
          </div>
        )}
      </div>
    </Overlay>
  );
}

// ============================================================
// TEAM PANEL
// ============================================================
function TeamPanel({ members, onAdd, onRemove, onClose }) {
  const [name, setName] = useState("");

  return (
    <Overlay onClose={onClose}>
      <div className="scale-in" onClick={(e) => e.stopPropagation()} style={{
        background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-primary)", width: 400, maxWidth: "92vw",
        boxShadow: "var(--shadow-lg)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Team Members</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}><Icons.X /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input placeholder="Member name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); setName(""); } }}
              style={{
                flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none",
              }}
            />
            <button onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(""); } }} style={{
              padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--accent)",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}><Icons.Plus /></button>
          </div>
          {members.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: 20 }}>No team members yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {members.map((m) => (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: "var(--bg-tertiary)", borderRadius: 8, border: "1px solid var(--border-secondary)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: m.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                  }}>{getInitials(m.name)}</div>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{m.name}</span>
                  <button onClick={() => onRemove(m.id)} style={{
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)",
                    display: "flex", padding: 4,
                  }}><Icons.X /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ============================================================
// LABEL PANEL
// ============================================================
function LabelPanel({ labels: existingLabels, onAdd, onRemove, onClose }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const presets = ["#ef4444","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#ec4899","#06b6d4","#f97316"];

  return (
    <Overlay onClose={onClose}>
      <div className="scale-in" onClick={(e) => e.stopPropagation()} style={{
        background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-primary)", width: 400, maxWidth: "92vw",
        boxShadow: "var(--shadow-lg)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Labels</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}><Icons.X /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <input placeholder="Label name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim(), color); setName(""); } }}
              style={{
                width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-primary)",
                borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", marginBottom: 8,
              }}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {presets.map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "2px solid #fff" : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.15s",
                }} />
              ))}
              <button onClick={() => { if (name.trim()) { onAdd(name.trim(), color); setName(""); } }} style={{
                marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "none",
                background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>Add</button>
            </div>
          </div>
          {existingLabels.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: 20 }}>No labels yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {existingLabels.map((l) => (
                <div key={l.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: "var(--bg-tertiary)", borderRadius: 8, border: "1px solid var(--border-secondary)",
                }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: l.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: l.color }}>{l.name}</span>
                  <button onClick={() => onRemove(l.id)} style={{
                    background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex", padding: 4,
                  }}><Icons.X /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ============================================================
// OVERLAY
// ============================================================
function Overlay({ children, onClose, side }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: side ? "stretch" : "center", justifyContent: side ? "flex-end" : "center",
      zIndex: 50, backdropFilter: "blur(4px)",
    }}>
      {children}
    </div>
  );
}

// ============================================================
// LOADING SCREEN
// ============================================================
function LoadingScreen() {
  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div style={{
        minHeight: "100vh", background: "var(--bg-primary)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700, color: "#fff",
          animation: "pulse 1.5s infinite",
        }}>K</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Loading your board...</div>
        <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
          {[1,2,3,4].map((i) => (
            <div key={i} style={{ width: 200, height: 300, borderRadius: 12 }} className="skeleton" />
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================
// ERROR SCREEN
// ============================================================
function ErrorScreen({ error, onRetry }) {
  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div style={{
        minHeight: "100vh", background: "var(--bg-primary)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "#7f1d1d33", border: "1px solid #7f1d1d66",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, color: "#ef4444",
        }}>!</div>
        <h2 style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
        <p style={{ color: "var(--text-tertiary)", fontSize: 13, maxWidth: 400, textAlign: "center" }}>{error}</p>
        <button onClick={onRetry} style={{
          padding: "10px 20px", borderRadius: 8, border: "none",
          background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>Try Again</button>
      </div>
    </>
  );
}
