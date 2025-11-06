import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "tasked.tasks";

const STATUS_LABELS = {
  today: "Today",
  upcoming: "Upcoming",
  backlog: "Backlog",
  completed: "Completed",
};

const STATUS_DESC = {
  today: "What needs your attention now",
  upcoming: "On deck for later this week",
  backlog: "Parked ideas and nice-to-haves",
  completed: "Wins to celebrate",
};

const PRIORITY_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const DEFAULT_TASKS = [
  {
    id: "kickoff",
    title: "Sprint planning for Q4",
    description: "Finalize scope, align owners, and set capacity targets for the upcoming sprint.",
    dueDate: addDays(Date.now(), 0),
    status: "today",
    priority: "high",
    tags: ["Planning", "Team"],
    createdAt: Date.now() - 1000 * 60 * 60 * 12,
  },
  {
    id: "retro",
    title: "Gather retro notes",
    description: "Collect learnings and kudos from the previous iteration in Confluence.",
    dueDate: addDays(Date.now(), 1),
    status: "upcoming",
    priority: "medium",
    tags: ["Process"],
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
  },
  {
    id: "ux-audit",
    title: "UX polish checklist",
    description: "Audit empty states, micro-copy, and accessibility contrast before launch.",
    dueDate: addDays(Date.now(), 3),
    status: "upcoming",
    priority: "high",
    tags: ["Design"],
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: "pipeline",
    title: "Pipeline hardening",
    description: "Add automated smoke tests and flaky test quarantine to CI.",
    dueDate: addDays(Date.now(), 5),
    status: "backlog",
    priority: "medium",
    tags: ["DevOps", "Automation"],
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: "docs",
    title: "Update api docs",
    description: "Document the new webhook endpoints and example payloads.",
    dueDate: addDays(Date.now(), -1),
    status: "completed",
    priority: "low",
    tags: ["Docs"],
    createdAt: Date.now() - 1000 * 60 * 60 * 36,
    completedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
];

function addDays(base, days) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function formatDueDate(input) {
  if (!input) return "No deadline";
  const date = new Date(input);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((date - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`;

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function prioritizeTasks(tasks, mode) {
  const weights = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...tasks].sort((a, b) => {
    if (mode === "priority") {
      return weights[b.priority] - weights[a.priority];
    }

    if (mode === "dueDate") {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aTime - bTime;
    }

    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
}

function TaskedApp() {
  const [tasks, setTasks] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TASKS;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_TASKS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return DEFAULT_TASKS;
      }
      return parsed;
    } catch (error) {
      console.warn("Unable to read tasks from storage", error);
      return DEFAULT_TASKS;
    }
  });
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState("priority");
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const metrics = useMemo(() => calculateMetrics(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return tasks.filter((task) => {
      if (filter !== "all" && task.status !== filter) {
        if (filter === "high" && task.priority !== "high") return false;
        else if (filter !== "high") return false;
      }

      if (normalizedSearch) {
        const haystack = `${task.title} ${task.description ?? ""} ${task.tags?.join(" ") ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [filter, searchTerm, tasks]);

  const groupedTasks = useMemo(() => {
    const sorted = prioritizeTasks(filteredTasks, sortMode);
    return sorted.reduce((acc, task) => {
      if (!acc[task.status]) acc[task.status] = [];
      acc[task.status].push(task);
      return acc;
    }, {});
  }, [filteredTasks, sortMode]);

  const focusTasks = useMemo(() => {
    const soonest = tasks.filter((task) => task.status !== "completed");
    const prioritized = prioritizeTasks(soonest, "dueDate");
    return prioritized.slice(0, 3);
  }, [tasks]);

  const completedRecently = useMemo(() => {
    const done = tasks.filter((task) => task.status === "completed");
    return prioritizeTasks(done, "createdAt").slice(0, 4);
  }, [tasks]);

  const themeVariant = useMemo(() => {
    if (metrics.completionRate >= 0.85) return "celebrate";
    if (metrics.completionRate >= 0.5) return "momentum";
    return "plan";
  }, [metrics.completionRate]);

  const handleCreateTask = (payload) => {
    if (!payload.title.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const newTask = {
      id,
      title: payload.title.trim(),
      description: payload.description.trim() || undefined,
      dueDate: payload.dueDate || null,
      status: payload.status ?? "today",
      priority: payload.priority ?? "medium",
      tags: payload.tags,
      createdAt: now,
    };

    setTasks((current) => [newTask, ...current]);
  };

  const handleToggleComplete = (taskId) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        const isDone = task.status === "completed";
        return {
          ...task,
          status: isDone ? "today" : "completed",
          completedAt: isDone ? undefined : Date.now(),
        };
      })
    );
  };

  const handleStatusChange = (taskId, nextStatus) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: nextStatus,
            }
          : task
      )
    );
  };

  const handleDeleteTask = (taskId) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  };

  return (
    <div className={`tasked-app theme-${themeVariant}`}>
      <div className="tasked-app__inner">
        <header className="tasked-app__header">
          <div className="tasked-app__headline">
            <div>
              <span className="tasked-app__badge">Tasked</span>
              <h1>Your command center for meaningful work</h1>
            </div>
            <p>
              Plan the day, align the week, and watch momentum build. Tasked keeps focus, context,
              and celebration in one calm workspace.
            </p>
          </div>
          <div className="tasked-app__toolbar">
            <SearchBar value={searchTerm} onChange={setSearchTerm} />
            <Filters
              filter={filter}
              onFilterChange={setFilter}
              sortMode={sortMode}
              onSortChange={setSortMode}
            />
          </div>
          <QuickAdd onSubmit={handleCreateTask} />
        </header>

        <SummaryBar metrics={metrics} onToggleDetails={() => setShowDetails((prev) => !prev)} />

        <main className="tasked-app__content">
          <section className="task-board card">
            <div className="task-board__header">
              <div>
                <h2>Task board</h2>
                <p>Organize work by state and keep the flow moving.</p>
              </div>
              <span className="task-board__indicator">{filteredTasks.length} showing</span>
            </div>
            <div className="task-board__columns">
              {Object.keys(STATUS_LABELS).map((status) => (
                <TaskColumn
                  key={status}
                  status={status}
                  label={STATUS_LABELS[status]}
                  description={STATUS_DESC[status]}
                  tasks={groupedTasks[status] ?? []}
                  onToggleComplete={handleToggleComplete}
                  onMove={handleStatusChange}
                  onDelete={handleDeleteTask}
                />
              ))}
            </div>
          </section>

          <aside className="tasked-app__side">
            <ProgressCard metrics={metrics} showDetails={showDetails} />
            <FocusList tasks={focusTasks} onComplete={handleToggleComplete} />
            <Celebration tasks={completedRecently} />
          </aside>
        </main>
      </div>
    </div>
  );
}

function SearchBar({ value, onChange }) {
  return (
    <label className="task-search" aria-label="Search tasks">
      <span className="task-search__icon" aria-hidden="true">
        🔍
      </span>
      <input
        className="task-search__input"
        type="search"
        placeholder="Search tasks, tags, owners"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Filters({ filter, onFilterChange, sortMode, onSortChange }) {
  return (
    <div className="filters">
      <div className="filters__group" role="group" aria-label="Filter tasks">
        {[
          { value: "all", label: "All" },
          { value: "today", label: "Today" },
          { value: "upcoming", label: "Upcoming" },
          { value: "completed", label: "Done" },
          { value: "high", label: "High priority" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={`pill ${filter === option.value ? "pill--active" : ""}`}
            onClick={() => onFilterChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="filters__select" aria-label="Sort tasks">
        <span>Sort by</span>
        <select value={sortMode} onChange={(event) => onSortChange(event.target.value)}>
          <option value="priority">Priority</option>
          <option value="dueDate">Due date</option>
          <option value="createdAt">Recently added</option>
        </select>
      </label>
    </div>
  );
}

function QuickAdd({ onSubmit }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("today");
  const [dueDate, setDueDate] = useState("");

  const handleFormSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      title,
      description,
      priority,
      status,
      dueDate: dueDate || null,
    });
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStatus("today");
    setDueDate("");
  };

  return (
    <form className="task-quick-add" onSubmit={handleFormSubmit}>
      <div className="task-quick-add__fields">
        <input
          className="task-quick-add__title"
          type="text"
          required
          placeholder="Add a task headline"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          className="task-quick-add__notes"
          type="text"
          placeholder="Optional notes or next steps"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="task-quick-add__meta">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {Object.keys(STATUS_LABELS).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            {Object.keys(PRIORITY_LABELS).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--primary">
          Add task
        </button>
      </div>
    </form>
  );
}

function SummaryBar({ metrics, onToggleDetails }) {
  return (
    <section className="summary card" aria-live="polite">
      <div className="summary__main">
        <div className="summary__progress">
          <span className="summary__label">Completion</span>
          <div className="summary__value">{Math.round(metrics.completionRate * 100)}%</div>
          <div className="summary__bar">
            <span style={{ width: `${Math.round(metrics.completionRate * 100)}%` }} />
          </div>
        </div>
        <div className="summary__metrics">
          <SummaryStat label="Active" value={metrics.activeCount} caption="Work in motion" />
          <SummaryStat label="Due soon" value={metrics.dueSoon} caption="Within 3 days" />
          <SummaryStat label="High priority" value={metrics.highPriority} caption="Needs focus" />
          <SummaryStat label="Streak" value={`${metrics.streak} days`} caption="Completed daily" />
        </div>
      </div>
      <button type="button" className="summary__toggle" onClick={onToggleDetails}>
        {metrics.momentumComment}
      </button>
    </section>
  );
}

function SummaryStat({ label, value, caption }) {
  return (
    <div className="summary-stat">
      <span className="summary-stat__label">{label}</span>
      <span className="summary-stat__value">{value}</span>
      <span className="summary-stat__caption">{caption}</span>
    </div>
  );
}

function TaskColumn({ status, label, description, tasks, onToggleComplete, onMove, onDelete }) {
  const nextStatuses = Object.keys(STATUS_LABELS).filter((value) => value !== status);

  return (
    <article className="task-column">
      <div className="task-column__header">
        <div>
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
        <span className="task-column__count">{tasks.length}</span>
      </div>
      <div className="task-column__list">
        {tasks.length === 0 ? (
          <EmptyState status={status} />
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              nextStatuses={nextStatuses}
              onToggleComplete={onToggleComplete}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </article>
  );
}

function TaskCard({ task, nextStatuses, onToggleComplete, onMove, onDelete }) {
  const dueLabel = formatDueDate(task.dueDate);
  const isOverdue = dueLabel.startsWith("Overdue");

  return (
    <div className={`task-card priority-${task.priority}`}>
      <header className="task-card__header">
        <div>
          <h4>{task.title}</h4>
          {task.description && <p>{task.description}</p>}
        </div>
        <button
          type="button"
          className={`task-card__status ${task.status === "completed" ? "is-complete" : ""}`}
          onClick={() => onToggleComplete(task.id)}
        >
          {task.status === "completed" ? "Completed" : "Mark done"}
        </button>
      </header>
      <footer className="task-card__footer">
        <div className="task-card__meta">
          <span className={`due-label ${isOverdue ? "is-overdue" : ""}`}>{dueLabel}</span>
          <span className={`priority-badge priority-badge--${task.priority}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.tags?.length ? (
            <span className="tag-strip">
              {task.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <div className="task-card__actions">
          <select
            aria-label="Move task"
            value={task.status}
            onChange={(event) => onMove(task.id, event.target.value)}
          >
            <option value={task.status}>Stay in {STATUS_LABELS[task.status]}</option>
            {nextStatuses.map((status) => (
              <option key={status} value={status}>
                Move to {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <button type="button" className="link-button" onClick={() => onDelete(task.id)}>
            Remove
          </button>
        </div>
      </footer>
    </div>
  );
}

function EmptyState({ status }) {
  const messages = {
    today: "Nothing urgent — take a moment to plan or breathe.",
    upcoming: "Line up what’s next so there are no surprises later.",
    backlog: "Ideas go here until they earn focus.",
    completed: "Celebrate the progress. You’re on a roll!",
  };

  return <div className="empty-state">{messages[status]}</div>;
}

function ProgressCard({ metrics, showDetails }) {
  return (
    <section className="progress card">
      <div className="card__title">Weekly momentum</div>
      <div className="progress__graph">
        <div className="progress__ring">
          <svg viewBox="0 0 120 120" role="img" aria-label="Completion progress">
            <circle className="progress__background" cx="60" cy="60" r="54" />
            <circle
              className="progress__stroke"
              cx="60"
              cy="60"
              r="54"
              style={{
                strokeDasharray: 2 * Math.PI * 54,
                strokeDashoffset: (1 - metrics.completionRate) * (2 * Math.PI * 54),
              }}
            />
            <text x="60" y="66" textAnchor="middle" className="progress__value">
              {Math.round(metrics.completionRate * 100)}%
            </text>
          </svg>
        </div>
        <div className="progress__copy">
          <h3>{metrics.focusArea.title}</h3>
          <p>{metrics.focusArea.body}</p>
        </div>
      </div>
      {showDetails && (
        <ul className="progress__list">
          {metrics.byStatus.map((item) => (
            <li key={item.status}>
              <span>{STATUS_LABELS[item.status]}</span>
              <span>
                {item.count} · {item.percentage}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FocusList({ tasks, onComplete }) {
  if (!tasks.length) {
    return (
      <section className="focus card">
        <div className="card__title">Focus trio</div>
        <p className="focus__empty">Choose up to three commitments to stay sharp.</p>
      </section>
    );
  }

  return (
    <section className="focus card">
      <div className="card__title">Focus trio</div>
      <ul className="focus__list">
        {tasks.map((task) => (
          <li key={task.id}>
            <button type="button" className="focus__complete" onClick={() => onComplete(task.id)}>
              ✓
            </button>
            <div>
              <h4>{task.title}</h4>
              <span>{formatDueDate(task.dueDate)}</span>
            </div>
            <span className={`priority-badge priority-badge--${task.priority}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Celebration({ tasks }) {
  return (
    <section className="celebration card">
      <div className="card__title">Recent wins</div>
      {tasks.length === 0 ? (
        <p className="celebration__empty">Complete a task to start the celebration feed.</p>
      ) : (
        <ul className="celebration__list">
          {tasks.map((task) => (
            <li key={task.id}>
              <h4>{task.title}</h4>
              <span>{timeSince(task.completedAt ?? task.createdAt)} ago</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function calculateMetrics(tasks) {
  const total = tasks.length || 1;
  const completed = tasks.filter((task) => task.status === "completed");
  const active = tasks.filter((task) => task.status !== "completed");
  const completionRate = completed.length / total;

  const dueSoon = active.filter((task) => {
    if (!task.dueDate) return false;
    const diffDays = (new Date(task.dueDate) - Date.now()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 3;
  }).length;

  const highPriority = active.filter((task) => task.priority === "high").length;

  const streak = calculateStreak(completed);

  const byStatus = Object.keys(STATUS_LABELS).map((status) => {
    const count = tasks.filter((task) => task.status === status).length;
    return {
      status,
      count,
      percentage: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });

  const focusArea = determineFocusArea({ completionRate, activeCount: active.length, dueSoon });

  const momentumComment =
    completionRate >= 0.8
      ? "Momentum high — keep stacking wins!"
      : completionRate >= 0.5
      ? "Solid pace. What’s the next domino?"
      : "Plot your next move and reclaim the day.";

  return {
    completionRate,
    highPriority,
    dueSoon,
    activeCount: active.length,
    streak,
    momentumComment,
    byStatus,
    focusArea,
  };
}

function calculateStreak(completedTasks) {
  if (!completedTasks.length) return 0;
  const days = new Set(
    completedTasks.map((task) => {
      const date = task.completedAt ? new Date(task.completedAt) : new Date(task.dueDate ?? task.createdAt);
      date.setHours(0, 0, 0, 0);
      return date.toISOString();
    })
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  for (let index = 0; index < 10; index += 1) {
    const cursor = new Date(today);
    cursor.setDate(today.getDate() - index);
    if (days.has(cursor.toISOString())) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function determineFocusArea({ completionRate, activeCount, dueSoon }) {
  if (completionRate >= 0.8) {
    return {
      title: "Celebrate & optimize",
      body: "Completion is above 80%. Look for light refactors, share updates, and tee up tomorrow’s wins.",
    };
  }

  if (dueSoon >= Math.max(2, Math.ceil(activeCount * 0.4))) {
    return {
      title: "Tackle upcoming deadlines",
      body: "Several tasks land within the next three days. Block focus time or reassign where needed.",
    };
  }

  if (activeCount >= 6) {
    return {
      title: "Streamline the workload",
      body: "There’s a lot in play. Prioritize the top three outcomes and nudge the rest to backlog or delegate.",
    };
  }

  return {
    title: "Build the habit",
    body: "Light load today. Claim a quick win and set stretch goals for the week.",
  };
}

function timeSince(timestamp) {
  if (!timestamp) return "moments";
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / (1000 * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default TaskedApp;


