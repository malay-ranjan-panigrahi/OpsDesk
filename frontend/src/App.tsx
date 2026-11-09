import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import "./index.css";
import "./App.css";
import { AnimatePresence, motion } from "framer-motion";
import { getAuditLogs, type AuditLog } from "./lib/auditLogs";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Copy,
  Database,
  Eye,
  FilePlus2,
  Filter,
  Globe,
  Grid2X2,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  Palette,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Ticket,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";

import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from "./lib/notifications";

import { getCurrentUser, login, type User } from "./lib/auth";
import { getDashboardSummary, type DashboardSummary } from "./lib/dashboard";
import { getHealth, getReadiness } from "./lib/api";
import {
  assignIncident,
  createIncident,
  getAgents,
  getIncidents,
  getIncidentById,
  getIncidentComments,
  createIncidentComment,
  type Agent,
  type Incident,
  type Comment,
  type CreateIncidentRequest,
} from "./lib/incidents";

type Page = "dashboard" | "incidents" | "create";
type ThemeMode = "dark" | "light" | "system";
type IncidentScope = "all" | "assigned" | "reported";
type ViewMode = "table" | "cards";

type Preferences = {
  theme: ThemeMode;
  accent: string;
  compact: boolean;
  showCharts: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
  notifyAssignments: boolean;
  notifyStatus: boolean;
  notifyMentions: boolean;
  emailNotifications: boolean;
  defaultView: "overview" | "incidents";
  timeZone: string;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  language: "en" | "hi";
};

type ExtendedDashboard = DashboardSummary & {
  resolved_incidents?: number;
  priority_counts?: Record<string, number>;
};

const initialForm: CreateIncidentRequest = {
  title: "",
  description: "",
  category: "APPLICATION",
  environment: "PRODUCTION",
  impact: "MEDIUM",
  urgency: "MEDIUM",
};

const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  accent: "#8b5cf6",
  compact: false,
  showCharts: true,
  autoRefresh: false,
  refreshInterval: 60,
  notifyAssignments: true,
  notifyStatus: true,
  notifyMentions: true,
  emailNotifications: false,
  defaultView: "overview",
  timeZone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  language: "en",
};

const ACCENT_OPTIONS = [
  { name: "Violet", value: "#8b5cf6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Green", value: "#10b981" },
  { name: "Orange", value: "#f59e0b" },
  { name: "Pink", value: "#ec4899" },
];

const formatIncident = (number: number) =>
  `INC-${String(number).padStart(6, "0")}`;

const priorityClass = (priority: string) =>
  `priority-${priority.toLowerCase()}`;

const statusClass = (status: string) =>
  `status-${status.toLowerCase().replaceAll("_", "-")}`;

function readPreferences(): Preferences {
  try {
    const saved = localStorage.getItem("opsdesk.preferences");
    if (saved) return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
  } catch {
    // Ignore invalid or unavailable local storage and use defaults.
  }

  return DEFAULT_PREFERENCES;
}

function formatDate(value: string, prefs: Preferences): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  const locale = prefs.dateFormat === "MM/DD/YYYY" ? "en-US" : "en-GB";

  if (prefs.dateFormat === "YYYY-MM-DD") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return date.toLocaleString(locale, {
    timeZone: prefs.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function buildTrend(incidents: Incident[], days: number) {
  const bucketCount = 7;
  const now = new Date();
  const start = new Date(now);

  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const bucketSize = days / bucketCount;
  const labels: string[] = [];
  const values = Array.from({ length: bucketCount }, () => 0);

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketDate = new Date(start);

    bucketDate.setDate(start.getDate() + Math.floor(index * bucketSize));

    labels.push(
      bucketDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    );
  }

  incidents.forEach((incident) => {
    const created = new Date(incident.created_at);

    if (Number.isNaN(created.getTime()) || created < start || created > now) {
      return;
    }

    const elapsedDays =
      (created.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);

    const bucket = Math.min(
      bucketCount - 1,
      Math.floor(elapsedDays / bucketSize),
    );

    values[bucket] += 1;
  });

  return { labels, values };
}

function App() {
  // All hooks are declared before the login conditional.

  const [email, setEmail] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(
    null,
  );

  const [page, setPage] = useState<Page>("dashboard");
  const [form, setForm] = useState<CreateIncidentRequest>(initialForm);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");

  const [commentVisibility, setCommentVisibility] = useState<
    "PUBLIC" | "INTERNAL"
  >("PUBLIC");

  const [commentMessage, setCommentMessage] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");

  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [environmentFilter, setEnvironmentFilter] = useState("ALL");

  const [scope, setScope] = useState<IncidentScope>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);

  const [loginLoading, setLoginLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [preferences, setPreferences] = useState<Preferences>(readPreferences);

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);

  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [incidentsExpanded, setIncidentsExpanded] = useState(true);
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [reportsExpanded, setReportsExpanded] = useState(false);

  const [comingSoon, setComingSoon] = useState("");
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  type HealthState = "checking" | "healthy" | "unavailable" | "idle";

  const [systemHealth, setSystemHealth] = useState({
    api: "idle" as HealthState,
    database: "idle" as HealthState,
    incidents: "idle" as HealthState,
  });

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const canAssign = user?.role === "ADMIN" || user?.role === "AGENT";

  const extendedDashboard = dashboard as ExtendedDashboard | null;

  useEffect(() => {
    if (!token) {
      setAuditLogs([]);
      return;
    }

    let isActive = true;

    const loadAuditLogs = async () => {
      try {
        const logs = await getAuditLogs(token, 0, 10);

        if (isActive) {
          setAuditLogs(logs);
        }
      } catch (error) {
        console.error("Failed to load audit logs:", error);
      }
    };

    void loadAuditLogs();

    const interval = window.setInterval(() => {
      void loadAuditLogs();
    }, 60000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [token]);
  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    let isActive = true;

    const loadNotifications = async () => {
      try {
        const [items, count] = await Promise.all([
          getNotifications(token),
          getUnreadCount(token),
        ]);

        if (isActive) {
          setNotifications(items);
          setUnreadCount(count.unread_count);
        }
      } catch (error) {
        console.error("Failed to load notifications:", error);
      }
    };

    void loadNotifications();

    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 30000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [token]);
  function updatePreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  // Persist preferences locally on this browser.

  useEffect(() => {
    try {
      localStorage.setItem("opsdesk.preferences", JSON.stringify(preferences));
    } catch {
      // Preferences still work for the current session.
    }
  }, [preferences]);

  // Apply Light, Dark, or System theme.

  useEffect(() => {
    const applyTheme = () => {
      if (preferences.theme === "system") {
        const dark = window.matchMedia?.(
          "(prefers-color-scheme: dark)",
        )?.matches;

        setResolvedTheme(dark ? "dark" : "light");
      } else {
        setResolvedTheme(preferences.theme);
      }
    };

    applyTheme();

    if (preferences.theme !== "system" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const listener = (event: MediaQueryListEvent) => {
      setResolvedTheme(event.matches ? "dark" : "light");
    };

    media.addEventListener("change", listener);

    return () => media.removeEventListener("change", listener);
  }, [preferences.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", preferences.accent);
  }, [preferences.accent]);

  // Keyboard shortcuts: Ctrl+K for search, Escape to close overlays.

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key === "Escape") {
        setSettingsOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
        setComingSoon("");
        setRowMenuId(null);
      }
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Optional automatic refresh.

  useEffect(() => {
    if (!token || !preferences.autoRefresh) return;

    const interval = window.setInterval(async () => {
      try {
        const [summary, records] = await Promise.all([
          getDashboardSummary(token),
          getIncidents(token),
        ]);

        setDashboard(summary);
        setIncidents(records);
        setLastUpdated(new Date());
      } catch {
        // Keep current dashboard data visible.
      }
    }, preferences.refreshInterval * 1000);

    return () => window.clearInterval(interval);
  }, [token, preferences.autoRefresh, preferences.refreshInterval]);

  // NEW: System health monitoring.

  useEffect(() => {
    if (!token) {
      setSystemHealth({
        api: "idle",
        database: "idle",
        incidents: "idle",
      });
      return;
    }

    let active = true;

    const checkSystemHealth = async () => {
      setSystemHealth({
        api: "checking",
        database: "checking",
        incidents: "checking",
      });
      const [apiResult, databaseResult, incidentResult] =
        await Promise.allSettled([
          getHealth(),
          getReadiness(),
          getIncidents(token),
        ]);

      if (!active) return;

      setSystemHealth({
        api:
          apiResult.status === "fulfilled" &&
          apiResult.value.status === "healthy"
            ? "healthy"
            : "unavailable",

        database:
          databaseResult.status === "fulfilled" &&
          databaseResult.value.status === "ready" &&
          databaseResult.value.dependencies.database === "connected"
            ? "healthy"
            : "unavailable",

        incidents:
          incidentResult.status === "fulfilled" ? "healthy" : "unavailable",
      });
    };

    void checkSystemHealth();

    const interval = window.setInterval(() => {
      void checkSystemHealth();
    }, 60000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  // Existing next useEffect continues here.

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => {
      setToast("");
    }, 3600);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => {
      setToast("");
    }, 3600);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const refreshDashboard = useCallback(async (authToken: string) => {
    const [summary, records] = await Promise.all([
      getDashboardSummary(authToken),
      getIncidents(authToken),
    ]);

    setDashboard(summary);
    setIncidents(records);
    setLastUpdated(new Date());
  }, []);

  const handleManualRefresh = async () => {
    if (!token) return;

    setRefreshing(true);

    try {
      await refreshDashboard(token);
      setToast("Workspace data refreshed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // Authentication.

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoginLoading(true);

    try {
      const auth = await login(email, password);

      const currentUser = await getCurrentUser(auth.access_token);

      setToken(auth.access_token);
      setUser(currentUser);

      await refreshDashboard(auth.access_token);

      if (currentUser.role === "ADMIN" || currentUser.role === "AGENT") {
        setAgentsLoading(true);

        try {
          setAgents(await getAgents(auth.access_token));
        } catch (agentError) {
          setToast(
            agentError instanceof Error
              ? agentError.message
              : "Unable to load agents",
          );
        } finally {
          setAgentsLoading(false);
        }
      } else {
        setAgents([]);
      }

      setPage(
        preferences.defaultView === "overview" ? "dashboard" : "incidents",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");

      setToken(null);
      setUser(null);
    } finally {
      setLoginLoading(false);
    }
  }

  // Create incident.

  async function handleCreateIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) return;

    setCreating(true);
    setError("");

    try {
      const created = await createIncident(token, form);

      setForm(initialForm);

      await refreshDashboard(token);

      setPage("incidents");
      setScope("all");

      setToast(
        `${formatIncident(created.incident_number)} created successfully`,
      );

      await handleSelectIncident(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incident creation failed");
    } finally {
      setCreating(false);
    }
  }

  // Load incident and its comments.

  async function handleSelectIncident(incidentId: string) {
    if (!token) return;

    setDetailLoading(true);
    setError("");
    setRowMenuId(null);

    try {
      const [incident, records] = await Promise.all([
        getIncidentById(token, incidentId),
        getIncidentComments(token, incidentId),
      ]);

      setSelectedIncident(incident);
      setComments(records);

      setSelectedAssigneeId(incident.assignee_id ?? "");

      setCommentBody("");
      setCommentVisibility("PUBLIC");
      setCommentMessage("");
      setAssignmentMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load incident");
    } finally {
      setDetailLoading(false);
    }
  }

  // Add public comment or internal note.

  async function handleCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !selectedIncident) return;

    setCommentLoading(true);
    setCommentMessage("");

    try {
      await createIncidentComment(token, selectedIncident.id, {
        body: commentBody,
        visibility: commentVisibility,
      });

      setComments(await getIncidentComments(token, selectedIncident.id));

      setCommentBody("");
      setCommentMessage("Comment added successfully.");
      setToast("Comment added");
    } catch (err) {
      setCommentMessage(
        err instanceof Error ? err.message : "Comment creation failed",
      );
    } finally {
      setCommentLoading(false);
    }
  }

  // Assign incident to an active agent.

  async function handleAssignIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !selectedIncident || !selectedAssigneeId) {
      return;
    }

    setAssignmentLoading(true);
    setAssignmentMessage("");

    try {
      const updated = await assignIncident(
        token,
        selectedIncident.id,
        selectedAssigneeId,
      );

      setSelectedIncident(updated);

      setIncidents((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );

      setAssignmentMessage("Incident assigned successfully.");
      setToast("Incident assignment saved");
    } catch (err) {
      setAssignmentMessage(
        err instanceof Error ? err.message : "Incident assignment failed",
      );
    } finally {
      setAssignmentLoading(false);
    }
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
    setDashboard(null);
    setIncidents([]);
    setSelectedIncident(null);
    setComments([]);
    setAgents([]);
    setSelectedAssigneeId("");
    setForm(initialForm);
    setEmail("");
    setPassword("");
    setError("");
    setToast("");
    setPage("dashboard");
    setProfileOpen(false);
  }

  // Incident scopes and filters.

  const scopedIncidents = useMemo(() => {
    if (!user || scope === "all") return incidents;

    if (scope === "assigned") {
      return incidents.filter((incident) => incident.assignee_id === user.id);
    }

    return incidents.filter((incident) => incident.reporter_id === user.id);
  }, [incidents, scope, user]);

  const filteredIncidents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return scopedIncidents.filter((incident) => {
      const matchesQuery =
        !query ||
        formatIncident(incident.incident_number)
          .toLowerCase()
          .includes(query) ||
        incident.title.toLowerCase().includes(query) ||
        incident.description.toLowerCase().includes(query);

      const matchesPriority =
        priorityFilter === "ALL" || incident.priority === priorityFilter;

      const matchesStatus =
        statusFilter === "ALL" || incident.status === statusFilter;

      const matchesEnvironment =
        environmentFilter === "ALL" ||
        incident.environment === environmentFilter;

      return (
        matchesQuery && matchesPriority && matchesStatus && matchesEnvironment
      );
    });
  }, [
    scopedIncidents,
    searchTerm,
    priorityFilter,
    statusFilter,
    environmentFilter,
  ]);

  const totalCount = extendedDashboard?.total_incidents ?? incidents.length;

  const openCount =
    extendedDashboard?.open_incidents ??
    incidents.filter(
      (incident) => !["RESOLVED", "CLOSED"].includes(incident.status),
    ).length;

  const resolvedCount =
    extendedDashboard?.resolved_incidents ??
    incidents.filter((incident) => incident.status === "RESOLVED").length;

  const closedCount =
    extendedDashboard?.closed_incidents ??
    incidents.filter((incident) => incident.status === "CLOSED").length;

  const priorityCounts = useMemo(() => {
    const values: Record<string, number> = {
      P1: 0,
      P2: 0,
      P3: 0,
      P4: 0,
    };

    incidents.forEach((incident) => {
      values[incident.priority] = (values[incident.priority] ?? 0) + 1;
    });

    return values;
  }, [incidents]);

  const statusCounts = useMemo(() => {
    const values: Record<string, number> = {
      NEW: 0,
      ACKNOWLEDGED: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      CLOSED: 0,
    };

    incidents.forEach((incident) => {
      values[incident.status] = (values[incident.status] ?? 0) + 1;
    });

    return values;
  }, [incidents]);

  const trend = useMemo(
    () => buildTrend(incidents, trendDays),
    [incidents, trendDays],
  );

  const openComingSoon = (label: string) => {
    setComingSoon(label);
    setSidebarMobileOpen(false);
  };

  const navigate = (target: Page) => {
    setPage(target);
    setSelectedIncident(null);
    setSidebarMobileOpen(false);
    setError("");
  };

  const handleGlobalSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSearchTerm(globalSearch);
    setPage("incidents");
    setScope("all");
    setSelectedIncident(null);
  };

  const copyIncidentIds = async () => {
    const ids = incidents
      .filter((incident) => selectedRows.includes(incident.id))
      .map((incident) => formatIncident(incident.incident_number))
      .join("\n");

    if (!ids) return;

    try {
      await navigator.clipboard.writeText(ids);
      setToast(`${selectedRows.length} incident ID(s) copied`);
    } catch {
      setToast("Clipboard access is unavailable in this browser");
    }
  };

  const visibleIncidentIds = filteredIncidents.map((incident) => incident.id);

  const allVisibleSelected =
    visibleIncidentIds.length > 0 &&
    visibleIncidentIds.every((id) => selectedRows.includes(id));

  const toggleAllVisible = () => {
    setSelectedRows((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIncidentIds.includes(id))
        : Array.from(new Set([...current, ...visibleIncidentIds])),
    );
  };

  // Login screen.

  if (!user) {
    return (
      <div className="login-shell" data-theme={resolvedTheme}>
        <div className="login-visual">
          <div className="login-brand">
            <span className="brand-mark">
              <Activity size={22} />
            </span>
            <span>
              OpsDesk<span className="brand-spark">✦</span>
            </span>
            <small>IT SERVICE MANAGEMENT</small>
          </div>

          <div className="login-hero-copy">
            <span className="eyebrow light">
              <span className="eyebrow-dot" />
              OPERATIONS COMMAND CENTER
            </span>

            <h1>
              Stay ahead of every <em>incident.</em>
            </h1>

            <p>
              One workspace to monitor, manage, and resolve IT operations with
              confidence.
            </p>
          </div>

          <div className="login-visual-footer">
            <ShieldCheck size={16} />
            Secure incident operations platform
          </div>

          <div className="visual-orb orb-one" />
          <div className="visual-orb orb-two" />
        </div>

        <div className="login-panel">
          <div className="mobile-brand">
            <span className="brand-mark">
              <Activity size={20} />
            </span>
            OpsDesk
          </div>

          <motion.div
            className="login-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Sign in to OpsDesk</h2>

            <p className="muted">
              Enter your work credentials to access your workspace.
            </p>

            <form className="form-stack login-form" onSubmit={handleLogin}>
              <label>
                Email address
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>

              {error && (
                <div className="inline-alert">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <button
                className="button button-primary button-wide"
                type="submit"
                disabled={loginLoading}
              >
                {loginLoading ? "Signing in..." : "Sign in"}
                <ArrowUpRight size={17} />
              </button>
            </form>

            <div className="login-security">
              <ShieldCheck size={16} />
              Protected with secure authentication
            </div>
          </motion.div>

          <span className="login-copyright">
            © 2026 OpsDesk · IT Incident Management
          </span>
        </div>
      </div>
    );
  }

  // Main application.

  return (
    <div
      className={`app-shell ${preferences.compact ? "compact-mode" : ""}`}
      data-theme={resolvedTheme}
      style={{ "--accent": preferences.accent } as CSSProperties}
    >
      <AnimatePresence>
        {sidebarMobileOpen && (
          <motion.button
            className="mobile-scrim"
            aria-label="Close navigation"
            onClick={() => setSidebarMobileOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}

      <aside className={`sidebar ${sidebarMobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">
            <Activity size={21} />
          </span>

          <span className="brand-wordmark">
            OpsDesk<span className="brand-spark">✦</span>
            <small>IT SERVICE MANAGEMENT</small>
          </span>

          <button
            className="sidebar-close icon-button"
            onClick={() => setSidebarMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="side-nav">
          <button
            className={page === "dashboard" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("dashboard")}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>

          <button
            className={`nav-link nav-parent ${
              page === "incidents" ? "active" : ""
            }`}
            onClick={() => {
              setIncidentsExpanded((value) => !value);
              navigate("incidents");
            }}
          >
            <Ticket size={18} />
            Incidents
            <span className="nav-count">{incidents.length}</span>
            <ChevronDown
              className={`nav-chevron ${incidentsExpanded ? "expanded" : ""}`}
              size={15}
            />
          </button>

          <AnimatePresence initial={false}>
            {incidentsExpanded && (
              <motion.div
                className="nav-submenu"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <button
                  className={
                    scope === "all" && page === "incidents"
                      ? "subnav-link selected"
                      : "subnav-link"
                  }
                  onClick={() => {
                    setScope("all");
                    navigate("incidents");
                  }}
                >
                  All incidents
                </button>

                <button
                  className={
                    scope === "assigned" && page === "incidents"
                      ? "subnav-link selected"
                      : "subnav-link"
                  }
                  onClick={() => {
                    setScope("assigned");
                    navigate("incidents");
                  }}
                >
                  Assigned to me
                </button>

                <button
                  className={
                    scope === "reported" && page === "incidents"
                      ? "subnav-link selected"
                      : "subnav-link"
                  }
                  onClick={() => {
                    setScope("reported");
                    navigate("incidents");
                  }}
                >
                  Reported by me
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            className={page === "create" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("create")}
          >
            <FilePlus2 size={18} />
            Create incident
          </button>

          <button
            className="nav-link"
            onClick={() => openComingSoon("Service requests")}
          >
            <MessageSquare size={18} />
            Requests
            <span className="nav-soon">SOON</span>
          </button>

          <button
            className="nav-link"
            onClick={() => openComingSoon("Problem management")}
          >
            <AlertCircle size={18} />
            Problems
            <span className="nav-soon">SOON</span>
          </button>

          <button
            className="nav-link"
            onClick={() => openComingSoon("Change management")}
          >
            <Workflow size={18} />
            Changes
            <span className="nav-soon">SOON</span>
          </button>

          <button
            className="nav-link"
            onClick={() => openComingSoon("Services and CMDB")}
          >
            <Server size={18} />
            Services
            <span className="nav-soon">SOON</span>
          </button>

          <button
            className="nav-link"
            onClick={() => openComingSoon("Knowledge base")}
          >
            <BookOpen size={18} />
            Knowledge Base
            <span className="nav-soon">SOON</span>
          </button>

          <button
            className="nav-link nav-parent"
            onClick={() => setReportsExpanded((value) => !value)}
          >
            <BarChart3 size={18} />
            Reports
            <ChevronDown
              className={`nav-chevron ${reportsExpanded ? "expanded" : ""}`}
              size={15}
            />
          </button>

          <AnimatePresence initial={false}>
            {reportsExpanded && (
              <motion.div
                className="nav-submenu"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <button
                  className="subnav-link"
                  onClick={() => openComingSoon("Incident reports")}
                >
                  Incident reports
                </button>

                <button
                  className="subnav-link"
                  onClick={() => openComingSoon("SLA reports")}
                >
                  SLA reports
                </button>

                <button
                  className="subnav-link"
                  onClick={() => openComingSoon("Trend analytics")}
                >
                  Trend analytics
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {user.role === "ADMIN" && (
            <>
              <button
                className="nav-link nav-parent"
                onClick={() => setAdminExpanded((value) => !value)}
              >
                <Settings size={18} />
                Administration
                <ChevronDown
                  className={`nav-chevron ${adminExpanded ? "expanded" : ""}`}
                  size={15}
                />
              </button>

              <AnimatePresence initial={false}>
                {adminExpanded && (
                  <motion.div
                    className="nav-submenu"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <button
                      className="subnav-link"
                      onClick={() => openComingSoon("Users and roles")}
                    >
                      Users & roles
                    </button>

                    <button
                      className="subnav-link"
                      onClick={() => openComingSoon("Groups")}
                    >
                      Groups
                    </button>

                    <button
                      className="subnav-link"
                      onClick={() => openComingSoon("Categories")}
                    >
                      Categories
                    </button>

                    <button
                      className="subnav-link"
                      onClick={() => openComingSoon("SLA and workflows")}
                    >
                      SLA & workflows
                    </button>

                    <button
                      className="subnav-link"
                      onClick={() => openComingSoon("System settings")}
                    >
                      System settings
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-health-card">
            <div className="system-health-heading">
              <span
                className={`health-pulse ${
                  Object.values(systemHealth).some(
                    (status) => status === "unavailable",
                  )
                    ? "health-offline"
                    : ""
                }`}
              />
              System Health
              <Activity size={16} />
            </div>

            {(
              [
                ["OpsDesk API", systemHealth.api],
                ["Database", systemHealth.database],
                ["Incident data", systemHealth.incidents],
              ] as const
            ).map(([label, status]) => (
              <div className="health-row" key={label}>
                <span>{label}</span>

                <strong className={`health-state health-${status}`}>
                  <i />
                  {status === "healthy"
                    ? label === "Database"
                      ? "Connected"
                      : "Healthy"
                    : status === "unavailable"
                      ? "Unavailable"
                      : status === "checking"
                        ? "Checking"
                        : "Waiting"}
                </strong>
              </div>
            ))}
          </div>

          <div className="sidebar-user">
            <div className="avatar">{getInitials(user.full_name)}</div>

            <div className="user-meta">
              <strong>{user.full_name}</strong>
              <span>{user.role}</span>
            </div>

            <button
              className="icon-button logout-button"
              title="Logout"
              onClick={handleLogout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main header */}

      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setSidebarMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <form className="global-search" onSubmit={handleGlobalSearch}>
            <Search size={17} />

            <input
              ref={searchInputRef}
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search incidents, requests, users, knowledge..."
              aria-label="Search workspace"
            />

            <kbd>
              <Command size={11} /> K
            </kbd>
          </form>

          <div className="topbar-actions">
            <span className="system-status">
              <i />
              All systems operational
            </span>

            <div className="popover-anchor">
              <button
                className={`icon-button top-action ${
                  notificationsOpen ? "selected" : ""
                }`}
                aria-label="Notifications"
                onClick={() => {
                  setNotificationsOpen((value) => !value);
                  setProfileOpen(false);
                }}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="notification-dot">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="floating-menu notification-menu">
                  <div className="floating-heading">
                    <div>
                      <strong>Recent incident updates</strong>
                      <small>Based on latest incident records</small>
                    </div>

                    <button
                      className="icon-button"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="menu-empty">No notifications yet.</div>
                  ) : (
                    <>
                      {unreadCount > 0 && (
                        <button
                          className="notification-item"
                          onClick={async () => {
                            if (!token) return;

                            try {
                              await markAllNotificationsRead(token);
                              setNotifications((items) =>
                                items.map((item) => ({
                                  ...item,
                                  is_read: true,
                                })),
                              );
                              setUnreadCount(0);
                            } catch (error) {
                              console.error(
                                "Failed to mark all as read:",
                                error,
                              );
                            }
                          }}
                        >
                          <strong>Mark all as read</strong>
                        </button>
                      )}

                      {notifications.map((notification) => (
                        <button
                          className="notification-item"
                          key={notification.id}
                          onClick={async () => {
                            if (!token) return;

                            try {
                              if (!notification.is_read) {
                                await markNotificationRead(
                                  token,
                                  notification.id,
                                );

                                setNotifications((items) =>
                                  items.map((item) =>
                                    item.id === notification.id
                                      ? { ...item, is_read: true }
                                      : item,
                                  ),
                                );

                                setUnreadCount((count) =>
                                  Math.max(0, count - 1),
                                );
                              }

                              setNotificationsOpen(false);
                              navigate("incidents");
                              handleSelectIncident(notification.incident_id);
                            } catch (error) {
                              console.error(
                                "Failed to update notification:",
                                error,
                              );
                            }
                          }}
                        >
                          <span className="notification-symbol">
                            <Ticket size={15} />
                          </span>

                          <span>
                            <strong>
                              {formatIncident(notification.incident_number)}
                              {" · "}
                              {notification.incident_title}
                            </strong>

                            <small>
                              {notification.actor_name} · {notification.message}
                            </small>

                            <small>
                              {formatDate(notification.created_at, preferences)}
                              {notification.is_read ? " · Read" : " · Unread"}
                            </small>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              className="icon-button top-action"
              aria-label="Help"
              onClick={() => openComingSoon("OpsDesk help center")}
            >
              <CircleHelp size={18} />
            </button>

            <button
              className={`icon-button top-action settings-trigger ${
                settingsOpen ? "selected" : ""
              }`}
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={18} />
            </button>

            <div className="popover-anchor profile-anchor">
              <button
                className="profile-trigger"
                onClick={() => {
                  setProfileOpen((value) => !value);
                  setNotificationsOpen(false);
                }}
              >
                <span className="topbar-avatar">
                  {getInitials(user.full_name)}
                </span>

                <span className="profile-meta">
                  <strong>{user.full_name}</strong>
                  <small>{user.role}</small>
                </span>

                <ChevronDown size={15} />
              </button>

              {profileOpen && (
                <div className="floating-menu profile-menu">
                  <div className="profile-menu-head">
                    <strong>{user.full_name}</strong>
                    <small>{user.email}</small>
                    <span className="role-chip">{user.role}</span>
                  </div>

                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <Settings size={15} />
                    Preferences
                  </button>

                  <button onClick={handleLogout}>
                    <LogOut size={15} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dashboard, Incidents and Create Incident pages */}

        <div className="page-content">
          <AnimatePresence mode="wait">
            {page === "dashboard" && (
              <motion.section
                key="dashboard"
                className="page-section"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <div className="command-heading">
                  <div>
                    <span className="eyebrow">OPERATIONS COMMAND CENTER</span>

                    <h1>
                      Good to see you, {user.full_name.split(" ")[0]}{" "}
                      <span>👋</span>
                    </h1>

                    <p>
                      Real-time service operations, incidents, and platform
                      health.
                    </p>
                  </div>

                  <div className="command-actions">
                    <div className="live-stamp">
                      <span />
                      LIVE
                    </div>

                    <span className="last-updated">
                      Updated{" "}
                      {lastUpdated.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    <button
                      className={`icon-button refresh-button ${
                        refreshing ? "spinning" : ""
                      }`}
                      aria-label="Refresh dashboard"
                      onClick={handleManualRefresh}
                      disabled={refreshing}
                    >
                      <RefreshCw size={16} />
                    </button>

                    <button
                      className="button button-primary"
                      onClick={() => navigate("create")}
                    >
                      <Plus size={17} />
                      New Incident
                    </button>
                  </div>
                </div>

                <div className="metric-grid command-metrics">
                  <MetricCard
                    label="Total Incidents"
                    value={totalCount}
                    icon={<LayersIcon />}
                    tone="violet"
                    detail="All reported tickets"
                    spark="purple"
                  />

                  <MetricCard
                    label="Open Incidents"
                    value={openCount}
                    icon={<Activity size={20} />}
                    tone="cyan"
                    detail="Needs attention"
                    spark="cyan"
                  />

                  <MetricCard
                    label="Resolved"
                    value={resolvedCount}
                    icon={<CheckCircle2 size={20} />}
                    tone="green"
                    detail="Successfully resolved"
                    spark="green"
                  />

                  <MetricCard
                    label="Closed"
                    value={closedCount}
                    icon={<ShieldCheck size={20} />}
                    tone="orange"
                    detail="Work completed"
                    spark="orange"
                  />
                </div>

                {preferences.showCharts && (
                  <div className="analytics-grid">
                    <section className="panel trend-panel">
                      <div className="panel-heading">
                        <div className="heading-with-icon">
                          <span className="section-icon">
                            <Activity size={18} />
                          </span>

                          <div>
                            <h3>Incident Trend</h3>
                            <p>Created incidents over time</p>
                          </div>
                        </div>

                        <div
                          className="segmented-control"
                          role="group"
                          aria-label="Trend time range"
                        >
                          {([7, 30, 90] as const).map((days) => (
                            <button
                              key={days}
                              className={trendDays === days ? "active" : ""}
                              onClick={() => setTrendDays(days)}
                            >
                              {days}D
                            </button>
                          ))}
                        </div>
                      </div>

                      <TrendChart labels={trend.labels} values={trend.values} />
                    </section>

                    <section className="panel distribution-panel">
                      <div className="panel-heading">
                        <div className="heading-with-icon">
                          <span className="section-icon">
                            <Zap size={18} />
                          </span>

                          <div>
                            <h3>Priority Distribution</h3>
                            <p>Incidents grouped by severity</p>
                          </div>
                        </div>
                      </div>

                      <div className="donut-layout">
                        <PriorityDonut
                          counts={priorityCounts}
                          total={incidents.length}
                        />

                        <div className="donut-legend">
                          {(["P1", "P2", "P3", "P4"] as const).map(
                            (priority) => (
                              <div className="legend-row" key={priority}>
                                <span
                                  className={`legend-dot ${priorityClass(
                                    priority,
                                  )}`}
                                />

                                <span>
                                  {priority}
                                  {" · "}
                                  {priority === "P1"
                                    ? "Critical"
                                    : priority === "P2"
                                      ? "High"
                                      : priority === "P3"
                                        ? "Medium"
                                        : "Low"}
                                </span>

                                <strong>{priorityCounts[priority] ?? 0}</strong>

                                <small>
                                  {incidents.length
                                    ? Math.round(
                                        ((priorityCounts[priority] ?? 0) /
                                          incidents.length) *
                                          100,
                                      )
                                    : 0}
                                  %
                                </small>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="panel status-panel">
                      <div className="panel-heading">
                        <div className="heading-with-icon">
                          <span className="section-icon">
                            <BarChart3 size={18} />
                          </span>

                          <div>
                            <h3>Incident Status</h3>
                            <p>Current status breakdown</p>
                          </div>
                        </div>
                      </div>

                      <div className="status-breakdown">
                        {(
                          [
                            "NEW",
                            "ACKNOWLEDGED",
                            "IN_PROGRESS",
                            "RESOLVED",
                            "CLOSED",
                          ] as const
                        ).map((status) => {
                          const count = statusCounts[status] ?? 0;

                          const percent = incidents.length
                            ? (count / incidents.length) * 100
                            : 0;

                          return (
                            <div className="status-breakdown-row" key={status}>
                              <StatusBadge status={status} />

                              <div className="status-track">
                                <span
                                  className={statusClass(status)}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>

                              <strong>{count}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                )}

                <div className="dashboard-lower-grid">
                  <section className="panel recent-panel command-recent-panel">
                    <div className="panel-heading">
                      <div className="heading-with-icon">
                        <span className="section-icon">
                          <List size={18} />
                        </span>

                        <div>
                          <h3>Recent Incidents</h3>
                          <p>Latest incidents in your workspace</p>
                        </div>
                      </div>

                      <button
                        className="text-button"
                        onClick={() => navigate("incidents")}
                      >
                        View All Incidents
                        <ArrowUpRight size={15} />
                      </button>
                    </div>

                    <IncidentTable
                      incidents={[...incidents]
                        .sort(
                          (a, b) =>
                            new Date(b.updated_at).getTime() -
                            new Date(a.updated_at).getTime(),
                        )
                        .slice(0, 5)}
                      onSelect={handleSelectIncident}
                      rowMenuId={rowMenuId}
                      setRowMenuId={setRowMenuId}
                      compact={preferences.compact}
                      dateFormat={preferences}
                    />
                  </section>

                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <div className="heading-with-icon">
                        <span className="section-icon">
                          <Activity size={18} />
                        </span>

                        <div>
                          <h3>Recent Updates</h3>
                          <p>Latest incident record changes</p>
                        </div>
                      </div>
                    </div>

                    <div className="activity-feed">
                      {auditLogs.length === 0 ? (
                        <div className="menu-empty">
                          No audit activity to show.
                        </div>
                      ) : (
                        auditLogs.map((log, index) => {
                          const actionLabels: Record<string, string> = {
                            INCIDENT_CREATED: "created incident",
                            INCIDENT_ASSIGNED: "assigned incident",
                            STATUS_CHANGED: "changed the status of",
                            COMMENT_ADDED: "added a comment to",
                          };

                          return (
                            <button
                              className="activity-item"
                              key={log.id}
                              onClick={() =>
                                handleSelectIncident(log.incident_id)
                              }
                            >
                              <span
                                className={`activity-marker marker-${index % 4}`}
                              >
                                <Ticket size={14} />
                              </span>

                              <span className="activity-copy">
                                <strong>
                                  {log.actor_name}{" "}
                                  {actionLabels[log.action] ||
                                    log.action
                                      .replaceAll("_", " ")
                                      .toLowerCase()}
                                </strong>

                                <small>
                                  {formatIncident(log.incident_number)}
                                  {" · "}
                                  {log.incident_title}
                                </small>

                                <time>
                                  {formatDate(log.created_at, preferences)}
                                </time>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>
              </motion.section>
            )}

            {page === "incidents" && (
              <motion.section
                key="incidents"
                className="page-section"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <div className="page-heading command-page-heading">
                  <div>
                    <span className="eyebrow">SERVICE OPERATIONS</span>
                    <h1>Incident Management</h1>
                    <p>
                      Track, prioritize, and manage reported service issues.
                    </p>
                  </div>

                  <button
                    className="button button-primary"
                    onClick={() => navigate("create")}
                  >
                    <Plus size={17} />
                    New Incident
                  </button>
                </div>

                <section className="panel incidents-panel command-incidents-panel">
                  <div className="incident-toolbar">
                    <div className="incident-search">
                      <Search size={16} />

                      <input
                        placeholder="Search incidents..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />

                      <kbd>/</kbd>
                    </div>

                    <label className="toolbar-select">
                      <Filter size={15} />
                      <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                      >
                        <option value="ALL">All priorities</option>

                        {["P1", "P2", "P3", "P4"].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>

                    <label className="toolbar-select">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="ALL">All statuses</option>

                        {[
                          "NEW",
                          "ACKNOWLEDGED",
                          "IN_PROGRESS",
                          "RESOLVED",
                          "CLOSED",
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>

                    <label className="toolbar-select">
                      <select
                        value={environmentFilter}
                        onChange={(e) => setEnvironmentFilter(e.target.value)}
                      >
                        <option value="ALL">All environments</option>

                        {[
                          ...new Set(incidents.map((item) => item.environment)),
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>

                    <div className="view-toggle">
                      <button
                        className={viewMode === "table" ? "active" : ""}
                        onClick={() => setViewMode("table")}
                        aria-label="Table view"
                      >
                        <List size={16} />
                      </button>

                      <button
                        className={viewMode === "cards" ? "active" : ""}
                        onClick={() => setViewMode("cards")}
                        aria-label="Card view"
                      >
                        <Grid2X2 size={16} />
                      </button>
                    </div>

                    <button
                      className="toolbar-reset"
                      onClick={() => {
                        setSearchTerm("");
                        setPriorityFilter("ALL");
                        setStatusFilter("ALL");
                        setEnvironmentFilter("ALL");
                        setScope("all");
                      }}
                    >
                      Reset
                    </button>
                  </div>

                  <div className="table-summary">
                    <span>
                      Showing <strong>{filteredIncidents.length}</strong> of{" "}
                      <strong>{scopedIncidents.length}</strong> incidents
                    </span>

                    {selectedRows.length > 0 && (
                      <div className="bulk-actions">
                        <span>{selectedRows.length} selected</span>

                        <button onClick={copyIncidentIds}>
                          <Copy size={14} />
                          Copy IDs
                        </button>

                        <button onClick={() => setSelectedRows([])}>
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {viewMode === "table" ? (
                    <IncidentTable
                      incidents={filteredIncidents}
                      onSelect={handleSelectIncident}
                      selectable
                      selectedIds={selectedRows}
                      onToggleRow={(id) =>
                        setSelectedRows((current) =>
                          current.includes(id)
                            ? current.filter((value) => value !== id)
                            : [...current, id],
                        )
                      }
                      onToggleAll={toggleAllVisible}
                      allSelected={allVisibleSelected}
                      rowMenuId={rowMenuId}
                      setRowMenuId={setRowMenuId}
                      compact={preferences.compact}
                      dateFormat={preferences}
                    />
                  ) : (
                    <div className="incident-card-grid">
                      {filteredIncidents.map((incident) => (
                        <button
                          className="incident-card"
                          key={incident.id}
                          onClick={() => handleSelectIncident(incident.id)}
                        >
                          <div className="incident-card-top">
                            <span>
                              {formatIncident(incident.incident_number)}
                            </span>
                            <PriorityBadge priority={incident.priority} />
                          </div>

                          <strong>{incident.title}</strong>

                          <p>{incident.description}</p>

                          <div className="incident-card-footer">
                            <StatusBadge status={incident.status} />
                            <span>{incident.environment}</span>
                            <ArrowUpRight size={15} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {filteredIncidents.length === 0 && (
                    <div className="empty-state">
                      <Ticket size={24} />
                      <strong>No incidents match these filters</strong>
                      <span>Adjust the filters or clear the search.</span>
                    </div>
                  )}
                </section>
              </motion.section>
            )}

            {page === "create" && (
              <motion.section
                key="create"
                className="page-section create-page"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">SERVICE OPERATIONS</span>
                    <h1>Create Incident</h1>
                    <p>
                      Capture the issue and its business impact so the right
                      team can respond.
                    </p>
                  </div>
                </div>

                <form
                  className="panel create-form command-create-form"
                  onSubmit={handleCreateIncident}
                >
                  <div className="form-section-title">
                    <span className="form-section-icon">
                      <FilePlus2 size={18} />
                    </span>

                    <div>
                      <h3>Incident information</h3>
                      <p className="muted">
                        Enter the details required to create a new incident.
                      </p>
                    </div>
                  </div>

                  <div className="form-grid">
                    <label className="field full-field">
                      Incident title
                      <input
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                        placeholder="e.g. Production database connection failure"
                        minLength={3}
                        maxLength={200}
                        required
                      />
                    </label>

                    <label className="field full-field">
                      Description
                      <textarea
                        value={form.description}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            description: e.target.value,
                          })
                        }
                        placeholder="Describe what happened, when it started, and who is affected..."
                        minLength={5}
                        rows={5}
                        required
                      />
                    </label>

                    <label className="field">
                      Category
                      <select
                        value={form.category}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            category: e.target.value,
                          })
                        }
                      >
                        {[
                          "APPLICATION",
                          "DATABASE",
                          "NETWORK",
                          "INFRASTRUCTURE",
                          "SECURITY",
                          "OTHER",
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      Environment
                      <select
                        value={form.environment}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            environment: e.target.value,
                          })
                        }
                      >
                        {["DEVELOPMENT", "TEST", "STAGING", "PRODUCTION"].map(
                          (value) => (
                            <option key={value}>{value}</option>
                          ),
                        )}
                      </select>
                    </label>

                    <label className="field">
                      Impact
                      <select
                        value={form.impact}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            impact: e.target.value,
                          })
                        }
                      >
                        {["HIGH", "MEDIUM", "LOW"].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      Urgency
                      <select
                        value={form.urgency}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            urgency: e.target.value,
                          })
                        }
                      >
                        {["HIGH", "MEDIUM", "LOW"].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {error && (
                    <div className="inline-alert">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}

                  <div className="form-footer">
                    <span className="muted">
                      Required fields must be completed before submission.
                    </span>

                    <div className="form-footer-actions">
                      <button
                        className="button button-ghost"
                        type="button"
                        onClick={() => navigate("incidents")}
                      >
                        Cancel
                      </button>

                      <button
                        className="button button-primary"
                        type="submit"
                        disabled={creating}
                      >
                        {creating ? "Creating..." : "Create Incident"}
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                </form>
              </motion.section>
            )}
          </AnimatePresence>

          {detailLoading && (
            <div className="loading-strip">
              <span />
              Loading incident details...
            </div>
          )}

          {/* Incident detail panel */}

          <AnimatePresence>
            {selectedIncident && (
              <motion.section
                className="panel detail-panel command-detail-panel"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <div className="detail-header">
                  <div>
                    <span className="eyebrow">INCIDENT DETAILS</span>
                    <h2>{selectedIncident.title}</h2>
                    <p className="muted">
                      {formatIncident(selectedIncident.incident_number)}
                      {" · "}
                      Reported{" "}
                      {formatDate(selectedIncident.created_at, preferences)}
                    </p>
                  </div>

                  <button
                    className="icon-button"
                    onClick={() => setSelectedIncident(null)}
                    aria-label="Close details"
                  >
                    <X size={19} />
                  </button>
                </div>

                <div className="detail-layout">
                  <div className="detail-main">
                    <div className="detail-badges">
                      <PriorityBadge priority={selectedIncident.priority} />
                      <StatusBadge status={selectedIncident.status} />
                      <span className="soft-tag">
                        {selectedIncident.environment}
                      </span>
                    </div>

                    <p className="detail-description">
                      {selectedIncident.description}
                    </p>

                    <div className="detail-facts">
                      <Fact
                        label="Category"
                        value={selectedIncident.category}
                      />
                      <Fact label="Impact" value={selectedIncident.impact} />
                      <Fact label="Urgency" value={selectedIncident.urgency} />
                      <Fact
                        label="Reporter ID"
                        value={selectedIncident.reporter_id}
                      />
                      <Fact
                        label="Assignee ID"
                        value={selectedIncident.assignee_id ?? "Unassigned"}
                      />
                      <Fact
                        label="Last updated"
                        value={formatDate(
                          selectedIncident.updated_at,
                          preferences,
                        )}
                      />
                    </div>

                    {canAssign && (
                      <form
                        className="assignment-box"
                        onSubmit={handleAssignIncident}
                      >
                        <div>
                          <h3>Assign to agent</h3>
                          <p className="muted">
                            Route this incident to an active support agent.
                          </p>
                        </div>

                        <div className="assignment-controls">
                          <select
                            value={selectedAssigneeId}
                            onChange={(e) =>
                              setSelectedAssigneeId(e.target.value)
                            }
                            disabled={agentsLoading || assignmentLoading}
                            required
                          >
                            <option value="">Select an agent</option>

                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.full_name} · {agent.email}
                              </option>
                            ))}
                          </select>

                          <button
                            className="button button-primary"
                            type="submit"
                            disabled={
                              assignmentLoading ||
                              agentsLoading ||
                              !selectedAssigneeId ||
                              ["RESOLVED", "CLOSED"].includes(
                                selectedIncident.status,
                              )
                            }
                          >
                            {assignmentLoading
                              ? "Assigning..."
                              : "Assign incident"}
                          </button>
                        </div>

                        {assignmentMessage && (
                          <p className="success-message">{assignmentMessage}</p>
                        )}
                      </form>
                    )}

                    <section className="comments-section">
                      <div className="section-heading">
                        <div>
                          <h3>Conversation</h3>
                          <p className="muted">
                            Updates and notes on this incident
                          </p>
                        </div>

                        <span className="comment-count">{comments.length}</span>
                      </div>

                      <div className="comment-list">
                        {comments.length === 0 ? (
                          <div className="empty-state small-empty">
                            <MessageSquare size={20} />
                            <span>
                              No comments yet. Start the conversation.
                            </span>
                          </div>
                        ) : (
                          comments.map((comment) => (
                            <article className="comment-item" key={comment.id}>
                              <div className="comment-avatar">
                                <Users size={15} />
                              </div>

                              <div className="comment-content">
                                <div className="comment-meta">
                                  <strong>
                                    {comment.visibility === "INTERNAL"
                                      ? "Internal note"
                                      : "Public comment"}
                                  </strong>

                                  <span>
                                    {formatDate(
                                      comment.created_at,
                                      preferences,
                                    )}
                                  </span>
                                </div>

                                <p>{comment.body}</p>

                                <span
                                  className={
                                    comment.visibility === "INTERNAL"
                                      ? "visibility-tag internal"
                                      : "visibility-tag"
                                  }
                                >
                                  {comment.visibility}
                                </span>
                              </div>
                            </article>
                          ))
                        )}
                      </div>

                      <form
                        className="comment-form"
                        onSubmit={handleCreateComment}
                      >
                        <textarea
                          value={commentBody}
                          onChange={(e) => setCommentBody(e.target.value)}
                          placeholder="Write an update..."
                          minLength={1}
                          maxLength={5000}
                          required
                        />

                        <div className="comment-form-footer">
                          <select
                            value={commentVisibility}
                            onChange={(e) =>
                              setCommentVisibility(
                                e.target.value as "PUBLIC" | "INTERNAL",
                              )
                            }
                          >
                            <option value="PUBLIC">Public comment</option>

                            {user.role !== "REPORTER" && (
                              <option value="INTERNAL">Internal note</option>
                            )}
                          </select>

                          <button
                            className="button button-primary button-small"
                            type="submit"
                            disabled={commentLoading || !commentBody.trim()}
                          >
                            {commentLoading ? "Sending..." : "Send update"}
                            <ArrowUpRight size={15} />
                          </button>
                        </div>

                        {commentMessage && (
                          <p className="muted form-feedback">
                            {commentMessage}
                          </p>
                        )}
                      </form>
                    </section>
                  </div>

                  <aside className="detail-aside">
                    <div className="aside-card">
                      <span className="aside-icon">
                        <Clock3 size={18} />
                      </span>

                      <span className="aside-label">Current status</span>

                      <StatusBadge status={selectedIncident.status} />

                      <p className="muted">
                        Status updates are controlled by the incident workflow.
                      </p>
                    </div>

                    <div className="aside-card">
                      <span className="aside-icon">
                        <Server size={18} />
                      </span>

                      <span className="aside-label">Environment</span>

                      <strong>{selectedIncident.environment}</strong>

                      <p className="muted">
                        Incident category: {selectedIncident.category}
                      </p>
                    </div>
                  </aside>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {error && page !== "create" && (
            <div className="inline-alert page-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>
      </main>

      {/* Settings drawer */}

      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.button
              className="drawer-scrim"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.aside
              className="settings-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                damping: 28,
                stiffness: 260,
              }}
            >
              <div className="drawer-header">
                <div className="drawer-title-icon">
                  <Settings size={18} />
                </div>

                <div>
                  <h2>Settings & Preferences</h2>
                  <p>Customize your OpsDesk workspace.</p>
                </div>

                <button
                  className="icon-button"
                  aria-label="Close settings"
                  onClick={() => setSettingsOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="drawer-content">
                <section className="settings-section">
                  <div className="settings-section-heading">
                    <h3>Appearance</h3>
                    <p>Choose how OpsDesk looks and feels.</p>
                  </div>

                  <div className="theme-picker">
                    {(
                      [
                        {
                          id: "light",
                          label: "Light",
                          icon: <Sun size={18} />,
                        },
                        {
                          id: "dark",
                          label: "Dark",
                          icon: <Moon size={18} />,
                        },
                        {
                          id: "system",
                          label: "System",
                          icon: <Monitor size={18} />,
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        className={
                          preferences.theme === item.id
                            ? "theme-option selected"
                            : "theme-option"
                        }
                        onClick={() => updatePreference("theme", item.id)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                        {preferences.theme === item.id && <Check size={13} />}
                      </button>
                    ))}
                  </div>

                  <div className="settings-label">
                    <Palette size={15} />
                    Accent color
                  </div>

                  <div className="accent-picker">
                    {ACCENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        title={option.name}
                        aria-label={`${option.name} accent`}
                        className={
                          preferences.accent === option.value
                            ? "accent-swatch selected"
                            : "accent-swatch"
                        }
                        style={{ "--swatch": option.value } as CSSProperties}
                        onClick={() => updatePreference("accent", option.value)}
                      >
                        {preferences.accent === option.value && (
                          <Check size={13} />
                        )}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-section">
                  <div className="settings-section-heading">
                    <h3>Display Options</h3>
                    <p>Adjust dashboard density and data refresh.</p>
                  </div>

                  <PreferenceToggle
                    icon={<SlidersHorizontal size={16} />}
                    label="Compact mode"
                    description="Show more data in less space"
                    checked={preferences.compact}
                    onChange={(value) => updatePreference("compact", value)}
                  />

                  <PreferenceToggle
                    icon={<BarChart3 size={16} />}
                    label="Charts & widgets"
                    description="Display analytics on the dashboard"
                    checked={preferences.showCharts}
                    onChange={(value) => updatePreference("showCharts", value)}
                  />

                  <PreferenceToggle
                    icon={<RefreshCw size={16} />}
                    label="Auto refresh"
                    description="Refresh incident data automatically"
                    checked={preferences.autoRefresh}
                    onChange={(value) => updatePreference("autoRefresh", value)}
                  />

                  <label className="settings-select-row">
                    <span>Refresh interval</span>

                    <select
                      value={preferences.refreshInterval}
                      onChange={(e) =>
                        updatePreference(
                          "refreshInterval",
                          Number(e.target.value),
                        )
                      }
                    >
                      <option value={30}>30 seconds</option>
                      <option value={60}>1 minute</option>
                      <option value={300}>5 minutes</option>
                      <option value={900}>15 minutes</option>
                    </select>
                  </label>
                </section>

                <section className="settings-section">
                  <div className="settings-section-heading">
                    <h3>Notifications</h3>
                    <p>Choose which in-app events you want to highlight.</p>
                  </div>

                  <PreferenceToggle
                    icon={<BellRing size={16} />}
                    label="Incident assignments"
                    description="When an incident is assigned"
                    checked={preferences.notifyAssignments}
                    onChange={(value) =>
                      updatePreference("notifyAssignments", value)
                    }
                  />

                  <PreferenceToggle
                    icon={<Activity size={16} />}
                    label="Status changes"
                    description="When an incident status changes"
                    checked={preferences.notifyStatus}
                    onChange={(value) =>
                      updatePreference("notifyStatus", value)
                    }
                  />

                  <PreferenceToggle
                    icon={<Users size={16} />}
                    label="Mentions"
                    description="When you are mentioned in an update"
                    checked={preferences.notifyMentions}
                    onChange={(value) =>
                      updatePreference("notifyMentions", value)
                    }
                  />

                  <PreferenceToggle
                    icon={<Mail size={16} />}
                    label="Email notifications"
                    description="Email delivery is not connected yet"
                    checked={preferences.emailNotifications}
                    onChange={(value) =>
                      updatePreference("emailNotifications", value)
                    }
                  />
                </section>

                <section className="settings-section">
                  <div className="settings-section-heading">
                    <h3>Preferences</h3>
                    <p>Set your workspace defaults.</p>
                  </div>

                  <label className="settings-select-row">
                    <span>
                      <LayoutDashboard size={15} />
                      Default view
                    </span>

                    <select
                      value={preferences.defaultView}
                      onChange={(e) =>
                        updatePreference(
                          "defaultView",
                          e.target.value as Preferences["defaultView"],
                        )
                      }
                    >
                      <option value="overview">Overview</option>
                      <option value="incidents">Incidents</option>
                    </select>
                  </label>

                  <label className="settings-select-row">
                    <span>
                      <Globe size={15} />
                      Time zone
                    </span>

                    <select
                      value={preferences.timeZone}
                      onChange={(e) =>
                        updatePreference("timeZone", e.target.value)
                      }
                    >
                      <option value="Asia/Kolkata">India Standard Time</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="Europe/London">London</option>
                    </select>
                  </label>

                  <label className="settings-select-row">
                    <span>
                      <CalendarDays size={15} />
                      Date format
                    </span>

                    <select
                      value={preferences.dateFormat}
                      onChange={(e) =>
                        updatePreference(
                          "dateFormat",
                          e.target.value as Preferences["dateFormat"],
                        )
                      }
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </label>

                  <label className="settings-select-row">
                    <span>
                      <Globe size={15} />
                      Language
                    </span>

                    <select
                      value={preferences.language}
                      onChange={(e) =>
                        updatePreference(
                          "language",
                          e.target.value as Preferences["language"],
                        )
                      }
                    >
                      <option value="en">English</option>
                      <option value="hi">
                        Hindi (labels not translated yet)
                      </option>
                    </select>
                  </label>
                </section>
              </div>

              <div className="drawer-footer">
                <button
                  className="button button-ghost"
                  onClick={() => setPreferences(DEFAULT_PREFERENCES)}
                >
                  Reset defaults
                </button>

                <button
                  className="button button-primary"
                  onClick={() => {
                    setToast("Preferences saved on this device");
                    setSettingsOpen(false);
                  }}
                >
                  Save Changes
                  <Check size={15} />
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Coming soon modal for modules without backend APIs */}

      <AnimatePresence>
        {comingSoon && (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setComingSoon("")}
          >
            <motion.div
              className="coming-soon-modal"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="coming-soon-icon">
                <Sparkles size={22} />
              </div>

              <button
                className="icon-button modal-close"
                onClick={() => setComingSoon("")}
              >
                <X size={17} />
              </button>

              <span className="eyebrow">ROADMAP</span>
              <h2>{comingSoon}</h2>

              <p>
                This module is part of the OpsDesk UI roadmap. Its backend
                workflow is not connected yet, so no placeholder data or actions
                will be presented as live.
              </p>

              <button
                className="button button-primary"
                onClick={() => setComingSoon("")}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast command-toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <CheckCircle2 size={17} />
            {toast}

            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LayersIcon() {
  return (
    <span className="layers-icon">
      <Database size={20} />
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  detail,
  spark,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
  detail: string;
  spark: string;
}) {
  return (
    <motion.div
      className={`metric-card command-metric-card tone-${tone}`}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
    >
      <div className="metric-card-icon">{icon}</div>

      <div className="metric-card-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>

      <Sparkline tone={spark} />
    </motion.div>
  );
}

function Sparkline({ tone }: { tone: string }) {
  return (
    <svg
      className={`metric-sparkline spark-${tone}`}
      viewBox="0 0 120 52"
      aria-hidden="true"
    >
      <path
        d="M1 43 C16 39 17 42 29 31 S48 39 61 25 S82 30 94 14 S109 17 119 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      <path
        d="M1 43 C16 39 17 42 29 31 S48 39 61 25 S82 30 94 14 S109 17 119 4 L119 52 L1 52Z"
        fill="currentColor"
        opacity=".10"
      />
    </svg>
  );
}

function TrendChart({
  labels,
  values,
}: {
  labels: string[];
  values: number[];
}) {
  const max = Math.max(4, ...values);

  const points = values.map((value, index) => ({
    x: 28 + index * 89,
    y: 145 - (value / max) * 112,
  }));

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  const area = `${line} L ${points[points.length - 1]?.x ?? 28},154 L 28,154 Z`;

  return (
    <div className="trend-chart-wrap">
      <svg
        className="trend-chart"
        viewBox="0 0 570 190"
        preserveAspectRatio="none"
        role="img"
        aria-label="Created incident trend based on currently loaded incident records"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity=".015" />
          </linearGradient>
        </defs>

        {[32, 60, 88, 116, 154].map((y) => (
          <line
            key={y}
            x1="28"
            x2="550"
            y1={y}
            y2={y}
            className="chart-gridline"
          />
        ))}

        {[0, 1, 2, 3, 4].map((value) => (
          <text
            key={value}
            x="8"
            y={158 - value * 28}
            className="chart-axis-label"
          >
            {value}
          </text>
        ))}

        <path d={area} fill="url(#trendFill)" />

        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="4"
            className="chart-point"
          />
        ))}
      </svg>

      <div className="chart-x-labels">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function PriorityDonut({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  const p1 = total ? ((counts.P1 ?? 0) / total) * 100 : 0;
  const p2 = total ? ((counts.P2 ?? 0) / total) * 100 : 0;
  const p3 = total ? ((counts.P3 ?? 0) / total) * 100 : 0;

  const gradient = total
    ? `conic-gradient(#f04461 0 ${p1}%, #f59e0b ${p1}% ${p1 + p2}%, #e5c34b ${p1 + p2}% ${p1 + p2 + p3}%, #10b981 ${p1 + p2 + p3}% 100%)`
    : "conic-gradient(#39445b 0 100%)";

  return (
    <div className="priority-donut" style={{ background: gradient }}>
      <div className="donut-hole">
        <strong>{total}</strong>
        <span>Total</span>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`badge ${priorityClass(priority)}`}>
      <i />
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${statusClass(status)}`}>
      <i />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreferenceToggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="preference-toggle-row">
      <span className="preference-icon">{icon}</span>

      <span className="preference-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle-switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function IncidentTable({
  incidents,
  onSelect,
  selectable = false,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  allSelected = false,
  rowMenuId = null,
  setRowMenuId,
  compact = false,
  dateFormat = DEFAULT_PREFERENCES,
}: {
  incidents: Incident[];
  onSelect: (id: string) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
  rowMenuId?: string | null;
  setRowMenuId?: (id: string | null) => void;
  compact?: boolean;
  dateFormat?: Preferences;
}) {
  if (incidents.length === 0) {
    return (
      <div className="empty-state">
        <Ticket size={25} />
        <strong>No incidents found</strong>
        <span>Try changing your filters or create a new incident.</span>
      </div>
    );
  }

  return (
    <div className={`table-scroll ${compact ? "table-compact" : ""}`}>
      <table className="incident-table command-incident-table">
        <thead>
          <tr>
            {selectable && (
              <th className="check-cell">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select all visible incidents"
                />
              </th>
            )}

            <th>Incident ID</th>
            <th>Title</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Environment</th>
            <th>Assignee</th>
            <th>Last updated</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {incidents.map((incident) => (
            <tr
              key={incident.id}
              className={
                selectedIds.includes(incident.id) ? "row-selected" : ""
              }
            >
              {selectable && (
                <td className="check-cell">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(incident.id)}
                    onChange={() => onToggleRow?.(incident.id)}
                    aria-label={`Select ${formatIncident(
                      incident.incident_number,
                    )}`}
                  />
                </td>
              )}

              <td>
                <button
                  className="incident-id-link"
                  onClick={() => onSelect(incident.id)}
                >
                  {formatIncident(incident.incident_number)}
                </button>
              </td>

              <td>
                <button
                  className="incident-title-link"
                  onClick={() => onSelect(incident.id)}
                >
                  {incident.title}
                </button>
              </td>

              <td>
                <PriorityBadge priority={incident.priority} />
              </td>

              <td>
                <StatusBadge status={incident.status} />
              </td>

              <td>
                <span className="soft-tag">{incident.environment}</span>
              </td>

              <td>
                <span className="assignee-cell">
                  {incident.assignee_id ? (
                    <>
                      <span className="mini-avatar">AG</span>
                      {incident.assignee_id.slice(0, 8)}…
                    </>
                  ) : (
                    "Unassigned"
                  )}
                </span>
              </td>

              <td className="date-cell">
                {formatDate(incident.updated_at, dateFormat)}
              </td>

              <td>
                <div className="row-action-wrap">
                  <button
                    className="row-action"
                    title="View incident"
                    onClick={() => onSelect(incident.id)}
                  >
                    <Eye size={15} />
                  </button>

                  {setRowMenuId && (
                    <button
                      className="row-action"
                      title="More actions"
                      onClick={() =>
                        setRowMenuId(
                          rowMenuId === incident.id ? null : incident.id,
                        )
                      }
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  )}

                  {rowMenuId === incident.id && (
                    <div className="row-action-menu">
                      <button onClick={() => onSelect(incident.id)}>
                        <Eye size={14} />
                        Open details
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(
                              formatIncident(incident.incident_number),
                            )
                            .then(() => undefined)
                            .catch(() => undefined);

                          setRowMenuId?.(null);
                        }}
                      >
                        <Copy size={14} />
                        Copy incident ID
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
