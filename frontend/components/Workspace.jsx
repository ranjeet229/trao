'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen,
  LayoutDashboard,
  Plus,
  LogOut,
  ArrowUpRight,
  ArrowLeft,
  Sparkles,
  Clock3,
  Layers,
  CheckCircle2,
  Search,
  ChevronRight,
  Trash2,
  LoaderCircle,
} from 'lucide-react';
import { api, Button, Notice, Tag, Empty } from './ui';
import IconButton from './IconButton';
import NewKit from './NewKit';
import KitEditor from './KitEditor';
import Practice from './Practice';

export default function Workspace() {
  const [user, setUser] = useState(null),
    [kits, setKits] = useState([]),
    [record, setRecord] = useState(null),
    [selected, setSelected] = useState(null),
    [newKit, setNewKit] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState('builder'),
    [search, setSearch] = useState(''),
    [dirty, setDirty] = useState(false);
  const recordRef = useRef(record);
  recordRef.current = record;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const loadList = useCallback(async () => {
    const data = await api('/kits');
    setKits(data.kits);
  }, []);
  useEffect(() => {
    Promise.all([api('/me').then((d) => setUser(d.user)), loadList()])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadList]);
  useEffect(() => {
    if (!selected) {
      setRecord(null);
      return;
    }
    setLoading(true);
    setError('');
    api(`/kits/${selected}`)
      .then(setRecord)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    let stopped = false;
    const interval = setInterval(async () => {
      if (!['queued', 'regenerating'].includes(recordRef.current?.status)) return;
      try {
        const next = await api(`/kits/${selected}`);
        if (stopped) return;
        if (dirtyRef.current) {
          setRecord((old) => ({ ...old, status: next.status, job: next.job, error: next.error }));
        } else setRecord(next);
        if (next.status === 'ready' || next.status === 'failed') await loadList();
      } catch (e) {
        if (!stopped) setError(e.message);
      }
    }, 1800);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [selected, loadList]);
  function navigate(id) {
    if (dirty && !window.confirm('You have unsaved edits. Leave this kit and discard them?'))
      return false;
    setDirty(false);
    setSelected(id);
    setMode('builder');
    setError('');
    return true;
  }
  function navigateHome(event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (navigate(null)) window.scrollTo({ top: 0 });
  }
  async function logout() {
    if (dirty && !window.confirm('Discard unsaved edits and sign out?')) return;
    try {
      await api('/auth/logout', { method: 'POST' });
      window.location.assign('/login');
    } catch (e) {
      setError(e.message);
    }
  }
  async function remove(id) {
    if (!window.confirm('Delete this kit and its practice history?')) return;
    try {
      await api(`/kits/${id}`, { method: 'DELETE' });
      if (selected === id) navigate(null);
      await loadList();
    } catch (e) {
      setError(e.message);
    }
  }
  const ready = kits.filter((k) => k.status === 'ready').length;
  const current = record?.kit;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate(null)}>
          <span className="brand-icon">
            <BookOpen size={21} />
          </span>
          readyroom<span className="brand-dot">.</span>
        </button>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <button className={`nav-item ${!selected ? 'active' : ''}`} onClick={() => navigate(null)}>
          <LayoutDashboard size={18} /> My preparation <span>{kits.length}</span>
        </button>
        <Button variant="sidebar-new" onClick={() => setNewKit(true)}>
          <Plus size={17} /> New prep kit
        </Button>
        <div className="sidebar-label recent-label">RECENT OPPORTUNITIES</div>
        <div className="recent-list">
          {kits.slice(0, 5).map((k) => (
            <button
              key={k._id}
              className={`recent-item ${selected === k._id ? 'selected' : ''}`}
              onClick={() => navigate(k._id)}
            >
              <span className="recent-dot" />
              <span>{k.title}</span>
              <ChevronRight size={14} />
            </button>
          ))}
          {!kits.length && (
            <p className="sidebar-empty">
              Your next opportunity
              <br />
              belongs here.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="user-row">
            <span className="avatar">{user?.name?.[0]?.toUpperCase() || 'R'}</span>
            <div>
              <strong>{user?.name || 'Your workspace'}</strong>
              <small>Personal workspace</small>
            </div>
            <IconButton
              className="icon-btn"
              title="Sign out"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut size={17} />
            </IconButton>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumbs">
              <li>
                <a href="/" onClick={navigateHome}>
                  Workspace
                </a>
              </li>
              <li aria-hidden="true">
                <ChevronRight size={14} />
              </li>
              <li>
                {selected ? (
                  <a href="/" onClick={navigateHome}>
                    My preparation
                  </a>
                ) : (
                  <span aria-current="page">My preparation</span>
                )}
              </li>
              {selected && (
                <>
                  <li aria-hidden="true">
                    <ChevronRight size={14} />
                  </li>
                  <li>
                    <span aria-current="page">Prep kit</span>
                  </li>
                </>
              )}
            </ol>
          </nav>
          <span className="topbar-note">
            <span /> A little more ready, every day
          </span>
        </header>
        <main className="main-content">
          <Notice>{error}</Notice>
          {loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              <p>Opening your workspace…</p>
            </div>
          ) : !selected ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR NEXT CHAPTER</span>
                  <h1>
                    Walk in <em>prepared.</em>
                  </h1>
                  <p className="muted">
                    A clear plan for every opportunity. Let’s make your next move count.
                  </p>
                </div>
                <Button onClick={() => setNewKit(true)}>
                  <Plus size={17} /> New prep kit
                </Button>
              </div>
              <section className="welcome-banner">
                <div>
                  <span className="eyebrow">FROM JOB DESCRIPTION TO GAME PLAN</span>
                  <h2>
                    Less guesswork.
                    <br />
                    More “I’ve got this.”
                  </h2>
                  <p>
                    Company insights, relevant questions and a daily plan.
                    <br />
                    Built around the role. Shaped by you.
                  </p>
                  <button onClick={() => setNewKit(true)}>
                    Prepare for a new opportunity <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="art-orbit" />
                  <div className="art-card back-card">
                    <span>THE BIG PICTURE</span>
                    <div />
                    <div />
                    <div />
                  </div>
                  <div className="art-card front-card">
                    <div className="art-check">
                      <CheckCircle2 size={26} />
                    </div>
                    <span>YOUR NEXT CHAPTER</span>
                    <strong>
                      You’re getting
                      <br />
                      closer.
                    </strong>
                    <div className="art-lines">
                      <span />
                      <span />
                      <span />
                    </div>
                    <small>ONE GOOD DAY AT A TIME</small>
                  </div>
                  <div className="art-spark">✦</div>
                </div>
              </section>
              <div className="stats-row">
                <div>
                  <span className="stat-icon">
                    <Layers size={19} />
                  </span>
                  <div>
                    <strong>{kits.length}</strong>
                    <span>Prep kits created</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <CheckCircle2 size={19} />
                  </span>
                  <div>
                    <strong>{ready}</strong>
                    <span>Ready to explore</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <Clock3 size={19} />
                  </span>
                  <div>
                    <strong>
                      {
                        kits.filter((k) => k.status === 'queued' || k.status === 'regenerating')
                          .length
                      }
                    </strong>
                    <span>Taking shape</span>
                  </div>
                </div>
              </div>
              <div className="section-heading kits-heading">
                <div>
                  <h2>
                    Your opportunities <span className="count">{kits.length}</span>
                  </h2>
                  <p className="muted">All your preparation, with room to make it your own.</p>
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search prep kits"
                    placeholder="Find a prep kit…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {!kits.length ? (
                <Empty
                  icon={BookOpen}
                  title="Your next opportunity starts here."
                  action={
                    <Button onClick={() => setNewKit(true)}>
                      <Plus size={16} /> Create your first prep kit
                    </Button>
                  }
                >
                  Paste a job description. We’ll help turn it into a plan you can actually follow.
                </Empty>
              ) : (
                <div className="kit-grid">
                  {kits
                    .filter((k) =>
                      `${k.title} ${k.company}`.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((k, i) => (
                      <article className="kit-card" key={k._id}>
                        <div className="kit-card-head">
                          <span className={`company-avatar color-${i % 3}`}>
                            {k.title[0]?.toUpperCase() || 'R'}
                          </span>
                          <Tag tone={k.status === 'failed' ? 'warm' : ''}>
                            {k.status === 'ready'
                              ? 'Ready to practise'
                              : k.status === 'failed'
                                ? 'Needs a retry'
                                : 'In progress'}
                          </Tag>
                          <IconButton
                            className="icon-btn"
                            aria-label={`Delete ${k.title}`}
                            onClick={() => remove(k._id)}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                        <button className="kit-card-title" onClick={() => navigate(k._id)}>
                          <h3>{k.title}</h3>
                          <p>{k.company.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
                        </button>
                        <div className="kit-card-foot">
                          <span>
                            Created{' '}
                            {new Date(k.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <button onClick={() => navigate(k._id)}>
                            Open kit <ArrowUpRight size={16} />
                          </button>
                        </div>
                      </article>
                    ))}
                  {!kits.some((k) =>
                    `${k.title} ${k.company}`.toLowerCase().includes(search.toLowerCase()),
                  ) && <p className="muted">No matching kits. Try another search.</p>}
                </div>
              )}
              <footer className="workspace-footer">Thoughtful preparation. Your own pace.</footer>
            </>
          ) : record ? (
            <>
              <button className="back-link" onClick={() => navigate(null)}>
                <ArrowLeft size={15} /> All opportunities
              </button>
              <div className="page-heading kit-heading">
                <div>
                  <span className="eyebrow">
                    {current?.source.company || 'YOUR NEXT OPPORTUNITY'}
                  </span>
                  <h1>{current?.role.title || record.title}</h1>
                  <p className="muted">
                    {current
                      ? `${current.schedule.days_available}-day plan · ${current.questions.length} questions · ${current.flashcards.length} flashcards`
                      : 'We’re turning your opportunity into a preparation plan.'}
                  </p>
                </div>
                {current && (
                  <div className="mode-toggle">
                    <button
                      className={mode === 'builder' ? 'active' : ''}
                      onClick={() => setMode('builder')}
                    >
                      Build & explore
                    </button>
                    <button
                      className={mode === 'practice' ? 'active' : ''}
                      onClick={() => {
                        if (dirty) {
                          toast.warning('Save your edits before starting practice.', {
                            id: 'unsaved-practice',
                            duration: 4000,
                          });
                          return;
                        }
                        setMode('practice');
                      }}
                    >
                      Practise <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              {record.status === 'failed' ? (
                <div className="panel">
                  <Notice>
                    {record.error || record.job?.error?.message || 'Generation did not finish.'}
                  </Notice>
                  <Button
                    onClick={async () => {
                      try {
                        await api(`/kits/${record._id}/retry`, { method: 'POST' });
                        setRecord({ ...record, status: 'queued' });
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Retry generation
                  </Button>
                </div>
              ) : !current ? (
                <Generation job={record.job} />
              ) : (
                <>
                  {current.research?.mode !== 'ai' && (
                    <Notice tone="warning">
                      {current.research?.mode === 'mixed'
                        ? 'Some sections used grounded templates because AI was unavailable.'
                        : 'This kit used grounded templates because AI was unavailable.'}{' '}
                      See the research log for details.
                    </Notice>
                  )}
                  {record.job?.status === 'failed' && <Notice>{record.job.error?.message}</Notice>}
                  {mode === 'practice' ? (
                    <Practice key={record._id} record={record} onUpdate={setRecord} />
                  ) : (
                    <KitEditor
                      key={record._id}
                      record={record}
                      onUpdate={setRecord}
                      onDirty={setDirty}
                    />
                  )}
                </>
              )}
            </>
          ) : null}
        </main>
      </div>
      {newKit && (
        <NewKit
          onClose={() => setNewKit(false)}
          onCreated={(id) => {
            setNewKit(false);
            void loadList();
            navigate(id);
          }}
        />
      )}
    </div>
  );
}
function Generation({ job }) {
  const steps = [
    'Read the role',
    'Research the company',
    'Build your question bank',
    'Check every requirement',
    'Make a daily plan',
  ];
  return (
    <section className="generation panel">
      <div className="generation-icon">
        <Sparkles size={30} />
      </div>
      <span className="eyebrow">GOOD PREPARATION TAKES A MOMENT</span>
      <h2>Your plan is taking shape.</h2>
      <p className="muted" role="status" aria-live="polite">
        {job?.message || 'Waiting for the research worker…'}
      </p>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Generation progress"
        aria-valuenow={job?.percent || 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${job?.percent || 0}%` }} />
      </div>
      <div className="generation-steps">
        {steps.map((s, i) => (
          <div key={s} className={(job?.percent || 0) > [8, 22, 54, 72, 87][i] ? 'done' : ''}>
            <span>
              {(job?.percent || 0) > [8, 22, 54, 72, 87][i] ? (
                <CheckCircle2 size={18} />
              ) : (
                String(i + 1).padStart(2, '0')
              )}
            </span>
            {s}
          </div>
        ))}
      </div>
      <small className="muted">You can leave this page. Progress is saved to your workspace.</small>
    </section>
  );
}
