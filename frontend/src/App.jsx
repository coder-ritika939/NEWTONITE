
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  LoaderCircle,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Users,
  Search,
  Filter,
  RefreshCw,
  UserCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  CirclePlus,
} from 'lucide-react';
import './App.css';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      data.error || data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [demoUsers, setDemoUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [user, setUser] = useState(() => {
    try {
      const token = localStorage.getItem('newtonite_token');
      const savedUser = localStorage.getItem('newtonite_user');

      return token && savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 8,
    totalPages: 0,
  });
  const [teams, setTeams] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [claimingId, setClaimingId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [viewFilter, setViewFilter] = useState('');

  useEffect(() => {
    async function fetchDemoUsers() {
      try {
        const response = await fetch('/api/auth/demo-users');
        const data = await readResponse(response);
        setDemoUsers(data.users || []);
      } catch {
        setError(
          'Cannot connect to the backend. Check that the backend server is running.'
        );
      } finally {
        setLoadingUsers(false);
      }
    }

    fetchDemoUsers();
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadDashboard() {
      setDashboardLoading(true);
      setDashboardError('');

      try {
        const token = localStorage.getItem('newtonite_token');

        if (!token) {
          throw new Error('Your session is missing. Please sign in again.');
        }

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const params = new URLSearchParams({
          page: String(pagination.page),
          limit: String(pagination.limit),
        });

        if (appliedSearch) params.set('search', appliedSearch);
        if (statusFilter) params.set('status', statusFilter);
        if (priorityFilter) params.set('priority', priorityFilter);
        if (typeFilter) params.set('type', typeFilter);
        if (viewFilter) params.set('view', viewFilter);

        const [summaryResponse, itemsResponse, teamsResponse] =
          await Promise.all([
            fetch('/api/dashboard/summary', { headers }),
            fetch(`/api/work-items?${params.toString()}`, { headers }),
            fetch('/api/teams', { headers }),
          ]);

        const [summaryData, itemsData, teamsData] = await Promise.all([
          readResponse(summaryResponse),
          readResponse(itemsResponse),
          readResponse(teamsResponse),
        ]);

        if (cancelled) return;

        setSummary(summaryData.summary || {});
        setItems(itemsData.items || []);
        setPagination((previous) => ({
          ...previous,
          ...(itemsData.pagination || {}),
        }));
        setTeams(teamsData.teams || []);
      } catch (err) {
        if (!cancelled) {
          setDashboardError(
            err.message || 'Unable to load dashboard data.'
          );
        }
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    pagination.page,
    pagination.limit,
    appliedSearch,
    statusFilter,
    priorityFilter,
    typeFilter,
    viewFilter,
    refreshKey,
  ]);

  function selectDemoUser(selectedEmail) {
    setEmail(selectedEmail);
    setPassword('password123');
    setError('');
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await readResponse(response);

      localStorage.setItem('newtonite_token', data.token);
      localStorage.setItem('newtonite_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setError(
        err.message || 'Unable to connect to the server. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('newtonite_token');
    localStorage.removeItem('newtonite_user');

    setUser(null);
    setSummary(null);
    setItems([]);
    setTeams([]);
    setEmail('');
    setPassword('');
    setError('');
    setDashboardError('');
    setSearch('');
    setAppliedSearch('');
    setStatusFilter('');
    setPriorityFilter('');
    setTypeFilter('');
    setViewFilter('');
    setPagination({
      total: 0,
      page: 1,
      limit: 8,
      totalPages: 0,
    });
  }

  async function handleClaim(itemId) {
    setClaimingId(itemId);
    setDashboardError('');

    try {
      const token = localStorage.getItem('newtonite_token');
      const response = await fetch(`/api/work-items/${itemId}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      await readResponse(response);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setDashboardError(err.message || 'Unable to claim this work item.');
    } finally {
      setClaimingId(null);
    }
  }

  function resetFilters() {
    setSearch('');
    setAppliedSearch('');
    setStatusFilter('');
    setPriorityFilter('');
    setTypeFilter('');
    setViewFilter('');
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  function chooseView(view) {
    setViewFilter(view);
    setPagination((previous) => ({ ...previous, page: 1 }));
  }

  if (user) {
    const role = String(user.role || '').toUpperCase();
    const isViewer = role === 'VIEWER';

    const stats = [
      {
        label: 'Assigned to Me',
        value: summary?.assignedToMe ?? '—',
        icon: UserCheck,
        view: 'assigned_to_me',
        color: 'purple',
      },
      {
        label: 'Unassigned Urgent',
        value: summary?.unassignedUrgent ?? '—',
        icon: AlertCircle,
        view: 'unassigned_urgent',
        color: 'orange',
      },
      {
        label: 'Awaiting Approval',
        value: summary?.awaitingApproval ?? '—',
        icon: Clock,
        view: 'awaiting_approval',
        color: 'blue',
      },
      {
        label: 'Total Active',
        value: summary?.totalActive ?? '—',
        icon: CheckCircle2,
        view: '',
        color: 'green',
      },
    ];

    return (
      <main className="dashboard-shell">
        <aside className="sidebar">
          <a className="brand dashboard-brand" href="/" aria-label="Newtonite home">
            <span className="brand-icon">
              <ShieldCheck size={23} />
            </span>
            <span>NEWTONITE</span>
          </a>

          <p className="sidebar-label">WORKSPACE</p>

          <button
            className="sidebar-link active"
            onClick={resetFilters}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>

          <button
            className="sidebar-link"
            onClick={() => {
              chooseView('');
              document.getElementById('work-items')?.scrollIntoView({
                behavior: 'smooth',
              });
            }}
          >
            <ClipboardList size={18} />
            Work Items
          </button>

          <button
            className="sidebar-link"
            onClick={() => {
              document.getElementById('team-section')?.scrollIntoView({
                behavior: 'smooth',
              });
            }}
          >
            <Users size={18} />
            My Team
          </button>

          <div className="sidebar-spacer" />

          <div className="sidebar-user">
            <span className="avatar sidebar-avatar">
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </span>
            <span className="sidebar-user-info">
              <strong>{user.name || 'User'}</strong>
              <small>{user.role}</small>
            </span>
          </div>

          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={17} />
            Sign out
          </button>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-topbar">
            <div>
              <p className="eyebrow">TEAM OPERATIONS</p>
              <h1>Workspace overview</h1>
              <p className="dashboard-subtitle">
                Here's what's happening with your team's work.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={dashboardLoading}
            >
              <RefreshCw
                size={16}
                className={dashboardLoading ? 'refresh-spinning' : ''}
              />
              Refresh
            </button>
          </header>

          <div className="user-welcome">
            <div>
              <span className="welcome-greeting">WELCOME BACK</span>
              <h2>Hello, {user.name || 'there'} 👋</h2>
              <p>
                {user.team_name || 'Your workspace'} · {role}
              </p>
            </div>
            <span className="welcome-shield">
              <ShieldCheck size={30} />
            </span>
          </div>

          {dashboardError && (
            <div className="dashboard-error">
              <AlertCircle size={18} />
              <span>{dashboardError}</span>
              <button onClick={() => setRefreshKey((value) => value + 1)}>
                Retry
              </button>
            </div>
          )}

          <div className="section-heading">
            <div>
              <h2>Overview</h2>
              <p>Live counts from your workspace</p>
            </div>
          </div>

          <div className="stats-grid">
            {stats.map((stat) => {
              const Icon = stat.icon;

              return (
                <button
                  className={`stat-card ${viewFilter === stat.view ? 'stat-selected' : ''}`}
                  key={stat.label}
                  onClick={() => chooseView(stat.view)}
                  title={`Show ${stat.label.toLowerCase()}`}
                >
                  <span className={`stat-icon ${stat.color}`}>
                    <Icon size={21} />
                  </span>
                  <span className="stat-label">{stat.label}</span>
                  <strong className="stat-value">
                    {dashboardLoading && summary === null ? '…' : stat.value}
                  </strong>
                  <span className="stat-hint">View work items <ArrowRight size={13} /></span>
                </button>
              );
            })}
          </div>

          <section className="work-section" id="work-items">
            <div className="section-heading work-heading">
              <div>
                <h2>Work Items</h2>
                <p>
                  {pagination.total} item{pagination.total === 1 ? '' : 's'} found
                </p>
              </div>
              <span className="role-badge">{role}</span>
            </div>

            <form
              className="filter-toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                setPagination((previous) => ({ ...previous, page: 1 }));
                setAppliedSearch(search.trim());
              }}
            >
              <div className="search-box">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Search title, description or item key..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPagination((previous) => ({ ...previous, page: 1 }));
                }}
              >
                <option value="">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="PENDING_APPROVAL">Pending approval</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>

              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(event) => {
                  setPriorityFilter(event.target.value);
                  setPagination((previous) => ({ ...previous, page: 1 }));
                }}
              >
                <option value="">All priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <select
                aria-label="Filter by type"
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value);
                  setPagination((previous) => ({ ...previous, page: 1 }));
                }}
              >
                <option value="">All types</option>
                <option value="Task">Task</option>
                <option value="Bug">Bug</option>
                <option value="Feature">Feature</option>
                <option value="Incident">Incident</option>
              </select>

              <button className="filter-button" type="submit">
                <Filter size={16} />
                Search
              </button>
            </form>

            {(viewFilter || statusFilter || priorityFilter || typeFilter || appliedSearch) && (
              <div className="active-filters">
                <span>
                  Showing filtered work items
                  {viewFilter ? ` · ${viewFilter.replaceAll('_', ' ')}` : ''}
                </span>
                <button onClick={resetFilters}>Clear filters</button>
              </div>
            )}

            <div className="table-wrap">
              <table className="work-table">
                <thead>
                  <tr>
                    <th>Work item</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardLoading && items.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="table-message">
                        <LoaderCircle className="spinner" size={22} />
                        <span>Loading work items...</span>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="table-message">
                        <Inbox size={28} />
                        <strong>No work items found</strong>
                        <span>Try changing the search or filters.</span>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="item-title-cell">
                            <strong>{item.title}</strong>
                            <small>{item.item_key || `#${item.id}`}</small>
                            {item.team_name && (
                              <small className="item-team">{item.team_name}</small>
                            )}
                          </div>
                        </td>
                        <td>{item.type || 'Task'}</td>
                        <td>
                          <span className={`priority-pill ${(item.priority || 'medium').toLowerCase()}`}>
                            {item.priority || 'MEDIUM'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${(item.status || 'open').toLowerCase()}`}>
                            {(item.status || 'OPEN').replaceAll('_', ' ')}
                          </span>
                        </td>
                        <td>{item.assignee_name || 'Unassigned'}</td>
                        <td>{formatDate(item.updated_at)}</td>
                        <td>
                          {item.assignee_id == null && !isViewer ? (
                            <button
                              className="claim-button"
                              disabled={claimingId === item.id}
                              onClick={() => handleClaim(item.id)}
                            >
                              {claimingId === item.id ? (
                                <LoaderCircle className="spinner" size={14} />
                              ) : (
                                <UserCheck size={14} />
                              )}
                              Claim
                            </button>
                          ) : (
                            <span className="no-action">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <span>
                Page {pagination.page} of {Math.max(1, pagination.totalPages || 1)}
              </span>
              <div>
                <button
                  aria-label="Previous page"
                  disabled={pagination.page <= 1 || dashboardLoading}
                  onClick={() =>
                    setPagination((previous) => ({
                      ...previous,
                      page: Math.max(1, previous.page - 1),
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                  Previous
                </button>
                <button
                  aria-label="Next page"
                  disabled={
                    pagination.page >= (pagination.totalPages || 1) ||
                    dashboardLoading
                  }
                  onClick={() =>
                    setPagination((previous) => ({
                      ...previous,
                      page: previous.page + 1,
                    }))
                  }
                >
                  Next
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </section>

          <section className="team-section" id="team-section">
            <div className="section-heading">
              <div>
                <h2><Users size={20} /> Your Teams</h2>
                <p>Teams available to your account</p>
              </div>
            </div>

            {teams.length > 0 ? (
              <div className="teams-grid">
                {teams.map((team) => (
                  <div className="team-card" key={team.id}>
                    <span className="team-icon"><Users size={20} /></span>
                    <div>
                      <strong>{team.name}</strong>
                      <small>Team ID: {team.id}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="team-empty">
                {dashboardLoading ? 'Loading teams...' : 'No teams available.'}
              </div>
            )}
          </section>

          <footer className="dashboard-footer">
            <span>© 2026 NEWTONITE OPS</span>
            <span><ShieldCheck size={14} /> Role-based workspace</span>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Newtonite home">
          <span className="brand-icon">
            <ShieldCheck size={23} />
          </span>
          <span>NEWTONITE</span>
        </a>
        <span className="secure-label">
          <span className="status-dot" />
          Secure workspace
        </span>
      </header>

      <section className="login-layout">
        <div className="intro-panel">
          <div className="intro-content">
            <span className="intro-tag">
              <Sparkles size={15} />
              OPERATIONS, SIMPLIFIED
            </span>

            <h1>
              Bring your team's
              <br />
              work into <span>focus.</span>
            </h1>

            <p>
              One workspace for work items, team collaboration and accountable
              workflows.
            </p>

            <div className="feature-list">
              <div><span className="feature-check">✓</span>Structured work management</div>
              <div><span className="feature-check">✓</span>Role-based access control</div>
              <div><span className="feature-check">✓</span>Clear ownership and accountability</div>
            </div>
          </div>

          <div className="intro-footer">
            NEWTONITE OPS <span>•</span> TEAM WORKSPACE
          </div>
        </div>

        <div className="form-panel">
          <div className="form-card">
            <div className="form-heading">
              <span className="form-icon"><ShieldCheck size={25} /></span>
              <p className="eyebrow">WELCOME BACK</p>
              <h2>Sign in to Newtonite</h2>
              <p>Enter your credentials to access your workspace.</p>
            </div>

            <form onSubmit={handleLogin}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@newtonite.io"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />

              <div className="password-label">
                <label htmlFor="password">Password</label>
              </div>

              <div className="password-input">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {error && <div className="error-message">{error}</div>}

              <button className="login-button" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="spinner" size={18} />
                    Signing in...
                  </>
                ) : (
                  <>Sign in <ArrowRight size={18} /></>
                )}
              </button>
            </form>

            <div className="demo-section">
              <div className="divider-label">
                <span />
                <p>OR TRY A DEMO ACCOUNT</p>
                <span />
              </div>

              <p className="demo-description">
                Choose a seeded account to fill in the login details.
              </p>

              {loadingUsers ? (
                <p className="demo-status">Loading demo accounts...</p>
              ) : demoUsers.length > 0 ? (
                <div className="demo-users">
                  {demoUsers.map((demoUser) => (
                    <button
                      type="button"
                      className={`demo-user ${email === demoUser.email ? 'selected' : ''}`}
                      key={demoUser.id}
                      onClick={() => selectDemoUser(demoUser.email)}
                    >
                      <span className="avatar">
                        {(demoUser.name || demoUser.email).charAt(0).toUpperCase()}
                      </span>
                      <span className="demo-user-info">
                        <strong>{demoUser.name}</strong>
                        <small>{demoUser.email}</small>
                      </span>
                      <span className="demo-role">{demoUser.role}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="demo-status">
                  Demo accounts are unavailable. You can still enter your
                  credentials above.
                </p>
              )}

              {demoUsers.length > 0 && (
                <p className="demo-password">
                  Demo password: <strong>password123</strong>
                </p>
              )}
            </div>

            <div className="security-note">
              <ShieldCheck size={16} />
              Your workspace is protected with role-based access.
            </div>
          </div>
        </div>
      </section>

      <footer className="page-footer">
        <span>© 2026 NEWTONITE OPS</span>
        <span>BUILT FOR BETTER WORKFLOWS</span>
      </footer>
    </main>
  );
}

export default App;
