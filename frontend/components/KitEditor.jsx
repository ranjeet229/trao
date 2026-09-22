'use client';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  Pin,
  RefreshCw,
  Save,
  Download,
  Check,
  FileJson,
} from 'lucide-react';
import { api, Button, Field, Notice, Tag, ExternalLink } from './ui';
import IconButton from './IconButton';
import Select from './Select';
import { allocateSchedule, checkCoverage } from '../../backend/src/core/schedule.js';
const categories = ['technical', 'behavioural', 'system-design', 'company-fit'];
const tabs = [
  ['company', 'Company brief'],
  ['role', 'Role breakdown'],
  ['questions', 'Questions'],
  ['flashcards', 'Flashcards'],
  ['schedule', 'Study plan'],
  ['sources', 'Research log'],
];
const uid = (p) => `${p}_${crypto.randomUUID()}`;
function Inline({ label, value, onChange, rows = 2 }) {
  return (
    <Field label={label}>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
function shift(items, index, direction) {
  const result = [...items];
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export default function KitEditor({ record, onUpdate, onDirty }) {
  const [kit, setKit] = useState(record.kit),
    [tab, setTab] = useState('company'),
    [category, setCategory] = useState('all'),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [json, setJson] = useState(null);
  useEffect(() => {
    if (!dirty) setKit(record.kit);
  }, [record.revision]);
  useEffect(() => {
    onDirty(dirty);
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, onDirty]);
  const update = (next) => {
    setKit(next);
    setDirty(true);
    setSaved(false);
  };
  function itemsUpdate(type, items) {
    const next = { ...kit, [type]: items };
    if (type === 'questions') {
      next.coverage = {
        ...kit.coverage,
        uncovered_requirement_ids: checkCoverage(next.role.requirements, items),
      };
      const ids = new Set(items.map((q) => q.id));
      next.schedule = {
        ...kit.schedule,
        days: kit.schedule.days.map((d) => ({
          ...d,
          question_ids: d.question_ids.filter((id) => ids.has(id)),
        })),
      };
    }
    update(next);
  }
  function editItem(type, id, patch) {
    itemsUpdate(
      type,
      kit[type].map((q) =>
        q.id === id ? { ...q, ...patch, origin: q.origin === 'manual' ? 'manual' : 'edited' } : q,
      ),
    );
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const result = await api(`/kits/${record._id}`, {
        method: 'PUT',
        body: JSON.stringify({ kit, revision: record.revision }),
      });
      setKit(result.kit);
      setDirty(false);
      setSaved(true);
      onUpdate({ ...record, ...result });
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function regenerate(section) {
    setError('');
    setBusy(true);
    try {
      let revision = record.revision;
      if (dirty) {
        const result = await save();
        if (!result) return;
        revision = result.revision;
      }
      setBusy(true);
      const { job } = await api(`/kits/${record._id}/regenerate`, {
        method: 'POST',
        body: JSON.stringify({ section, revision }),
      });
      onUpdate({ ...record, revision, kit, status: 'regenerating', job });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'readyroom-kit.json';
    a.click();
    URL.revokeObjectURL(href);
  }
  const regenButton = (section) => (
    <Button
      variant="ghost"
      busy={busy}
      disabled={record.status === 'regenerating'}
      onClick={() => regenerate(section)}
    >
      <RefreshCw size={14} /> Regenerate
    </Button>
  );
  return (
    <>
      <div className="editor-toolbar">
        <div className="tabs" role="tablist" aria-label="Kit sections">
          {tabs.map(([key, label]) => (
            <button
              role="tab"
              aria-selected={tab === key}
              key={key}
              onClick={() => setTab(key)}
              className={tab === key ? 'active' : ''}
            >
              {label}
              {key === 'questions' && <span>{kit.questions.length}</span>}
            </button>
          ))}
        </div>
        <div className="editor-actions">
          <span className="save-status">
            {dirty ? (
              'Unsaved changes'
            ) : saved ? (
              <>
                <Check size={13} /> Saved
              </>
            ) : (
              'All changes saved'
            )}
          </span>
          <Button variant="secondary" onClick={save} busy={busy} disabled={!dirty}>
            <Save size={14} /> Save
          </Button>
          <IconButton
            className="icon-btn"
            title="Export kit JSON"
            aria-label="Export kit JSON"
            onClick={download}
          >
            <Download size={17} />
          </IconButton>
          <IconButton
            className="icon-btn"
            title="Edit full kit JSON"
            aria-label="Edit full kit JSON"
            onClick={() => setJson(JSON.stringify(kit, null, 2))}
          >
            <FileJson size={17} />
          </IconButton>
        </div>
      </div>
      <Notice>{error}</Notice>
      {kit.coverage.uncovered_requirement_ids.length > 0 && (
        <Notice tone="warning">
          Your edits left {kit.coverage.uncovered_requirement_ids.length} requirements without
          questions. Add a question linked to each, or regenerate its category.
        </Notice>
      )}
      {record.status === 'regenerating' && (
        <Notice tone="info">
          Regenerating this section. Manual, edited and pinned questions will be preserved. You can
          keep editing; conflicting results will never overwrite your changes.
        </Notice>
      )}
      {json !== null && (
        <div className="panel">
          <h3>Full kit editor</h3>
          <p className="muted">Edit any field or ordering. Changes are validated when saved.</p>
          <textarea
            aria-label="Full kit JSON"
            className="code-editor"
            rows={15}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <div className="row">
            <Button
              onClick={() => {
                try {
                  const next = JSON.parse(json);
                  if (
                    !next.role?.requirements ||
                    !next.questions ||
                    !next.flashcards ||
                    !next.schedule?.days ||
                    !next.company_brief
                  )
                    throw new Error('Missing a required kit section.');
                  update(next);
                  setJson(null);
                  setError('');
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Apply locally
            </Button>
            <Button variant="ghost" onClick={() => setJson(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className="editor-body" role="tabpanel">
        {tab === 'company' && (
          <div className="brief-grid">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">KNOW WHO YOU’RE MEETING</span>
                  <h2>The company, in context.</h2>
                </div>
                {regenButton('company_brief')}
              </div>
              <Inline
                label="Company summary"
                value={kit.company_brief.summary}
                rows={7}
                onChange={(summary) =>
                  update({ ...kit, company_brief: { ...kit.company_brief, summary } })
                }
              />
              <Inline
                label="What they do"
                value={kit.company_brief.what_they_do}
                rows={5}
                onChange={(what_they_do) =>
                  update({ ...kit, company_brief: { ...kit.company_brief, what_they_do } })
                }
              />
              <div className="sources-inline">
                {kit.company_brief.sources.map((s) => (
                  <ExternalLink key={s} href={s}>
                    {(() => {
                      try {
                        return new URL(s).hostname;
                      } catch {
                        return s;
                      }
                    })()}
                  </ExternalLink>
                ))}
              </div>
            </section>
            <aside>
              <div className="panel green-panel">
                <span className="eyebrow">YOUR PREPARATION SNAPSHOT</span>
                <h3>Go in with a plan.</h3>
                <dl>
                  <div>
                    <dt>Requirements identified</dt>
                    <dd>{kit.role.requirements.length}</dd>
                  </div>
                  <div>
                    <dt>Questions to explore</dt>
                    <dd>{kit.questions.length}</dd>
                  </div>
                  <div>
                    <dt>Days to prepare</dt>
                    <dd>{kit.schedule.days_available}</dd>
                  </div>
                  <div>
                    <dt>Coverage passes</dt>
                    <dd>{kit.coverage.passes}</dd>
                  </div>
                </dl>
              </div>
              <div className="tip">
                <span className="eyebrow">MAKE IT YOURS</span>
                <p>
                  Everything here is a starting point. Add your own examples, sharpen an answer, or
                  pin a question worth keeping.
                </p>
              </div>
            </aside>
          </div>
        )}
        {tab === 'role' && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">READ BETWEEN THE LINES</span>
                <h2>What this role calls for.</h2>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  update({
                    ...kit,
                    role: {
                      ...kit.role,
                      requirements: [
                        {
                          id: uid('r'),
                          text: 'New requirement',
                          kind: 'technical',
                          priority: 'nice',
                        },
                        ...kit.role.requirements,
                      ],
                    },
                  })
                }
              >
                <Plus size={16} /> Add requirement
              </Button>
            </div>
            <div className="form-grid">
              <Field label="Role title">
                <input
                  value={kit.role.title}
                  onChange={(e) => update({ ...kit, role: { ...kit.role, title: e.target.value } })}
                />
              </Field>
              <Field label="Seniority">
                <input
                  value={kit.role.seniority}
                  onChange={(e) =>
                    update({ ...kit, role: { ...kit.role, seniority: e.target.value } })
                  }
                />
              </Field>
            </div>
            <Inline
              label="Responsibilities (one per line)"
              value={kit.role.responsibilities.join('\n')}
              rows={4}
              onChange={(v) =>
                update({ ...kit, role: { ...kit.role, responsibilities: v.split('\n') } })
              }
            />
            <h3>
              Requirements <span className="muted">({kit.role.requirements.length})</span>
            </h3>
            {kit.role.requirements.map((r, i) => (
              <div className="requirement" key={r.id}>
                <span className="item-number">{String(i + 1).padStart(2, '0')}</span>
                <div className="grow">
                  <input
                    aria-label={`Requirement ${i + 1}`}
                    value={r.text}
                    onChange={(e) =>
                      update({
                        ...kit,
                        role: {
                          ...kit.role,
                          requirements: kit.role.requirements.map((x) =>
                            x.id === r.id ? { ...x, text: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  />
                  <small className="muted requirement-meta">
                    {kit.questions.filter((q) => q.requirement_ids.includes(r.id)).length} linked
                    questions
                  </small>
                </div>
                <div className="requirement-controls">
                  <Select
                    aria-label="Requirement kind"
                    value={r.kind}
                    onChange={(e) =>
                      update({
                        ...kit,
                        role: {
                          ...kit.role,
                          requirements: kit.role.requirements.map((x) =>
                            x.id === r.id ? { ...x, kind: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  >
                    {['technical', 'behavioural', 'domain'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Requirement priority"
                    value={r.priority}
                    onChange={(e) =>
                      update({
                        ...kit,
                        role: {
                          ...kit.role,
                          requirements: kit.role.requirements.map((x) =>
                            x.id === r.id ? { ...x, priority: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  >
                    <option value="must">Must have</option>
                    <option value="nice">Nice to have</option>
                  </Select>
                  <IconButton
                    className="icon-btn"
                    aria-label="Move requirement up"
                    disabled={i === 0}
                    onClick={() =>
                      update({
                        ...kit,
                        role: { ...kit.role, requirements: shift(kit.role.requirements, i, -1) },
                      })
                    }
                  >
                    <ArrowUp size={15} />
                  </IconButton>
                  <IconButton
                    className="icon-btn"
                    aria-label="Delete requirement"
                    onClick={() => {
                      const requirements = kit.role.requirements.filter((x) => x.id !== r.id);
                      const questions = kit.questions.map((q) => ({
                        ...q,
                        requirement_ids: q.requirement_ids.filter((id) => id !== r.id),
                      }));
                      update({
                        ...kit,
                        role: { ...kit.role, requirements },
                        questions,
                        flashcards: kit.flashcards.map((f) => ({
                          ...f,
                          requirement_ids: f.requirement_ids.filter((id) => id !== r.id),
                        })),
                        coverage: {
                          ...kit.coverage,
                          uncovered_requirement_ids: checkCoverage(requirements, questions),
                        },
                      });
                    }}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
          </section>
        )}
        {tab === 'questions' && (
          <>
            <div className="section-heading">
              <div>
                <span className="eyebrow">PRACTISE THE QUESTIONS THAT MATTER</span>
                <h2>Your question bank.</h2>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  itemsUpdate('questions', [
                    {
                      id: uid('q'),
                      prompt: 'Your new question',
                      answer_outline: '',
                      requirement_ids: [],
                      category: category === 'all' ? 'technical' : category,
                      difficulty: 2,
                      origin: 'manual',
                      pinned: false,
                    },
                    ...kit.questions,
                  ])
                }
              >
                <Plus size={16} /> Add question
              </Button>
            </div>
            <div className="filter-row">
              <div className="chips">
                {['all', ...categories].map((c) => (
                  <button
                    key={c}
                    className={category === c ? 'selected' : ''}
                    onClick={() => setCategory(c)}
                  >
                    {c === 'all' ? 'All questions' : c.replace('-', ' ')}
                  </button>
                ))}
              </div>
              {category !== 'all' && regenButton(category)}
            </div>
            {kit.questions
              .filter((q) => category === 'all' || q.category === category)
              .map((q) => {
                const i = kit.questions.findIndex((x) => x.id === q.id);
                return (
                  <article className="panel question" key={q.id}>
                    <div className="question-head">
                      <span className="item-number">{String(i + 1).padStart(2, '0')}</span>
                      <Select
                        aria-label="Question category"
                        value={q.category}
                        onChange={(e) => editItem('questions', q.id, { category: e.target.value })}
                      >
                        {categories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                      <Tag tone={q.origin === 'generated' ? '' : 'warm'}>{q.origin}</Tag>
                      <div className="grow" />
                      <IconButton
                        className={`icon-btn ${q.pinned ? 'pinned' : ''}`}
                        aria-label={q.pinned ? 'Unpin question' : 'Pin question'}
                        aria-pressed={q.pinned}
                        onClick={() => editItem('questions', q.id, { pinned: !q.pinned })}
                      >
                        <Pin size={15} />
                      </IconButton>
                      <IconButton
                        className="icon-btn"
                        aria-label="Move question up"
                        disabled={i === 0}
                        onClick={() => itemsUpdate('questions', shift(kit.questions, i, -1))}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        className="icon-btn"
                        aria-label="Move question down"
                        disabled={i === kit.questions.length - 1}
                        onClick={() => itemsUpdate('questions', shift(kit.questions, i, 1))}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton
                        className="icon-btn"
                        aria-label="Delete question"
                        onClick={() =>
                          itemsUpdate(
                            'questions',
                            kit.questions.filter((x) => x.id !== q.id),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                    <Inline
                      label="Question"
                      value={q.prompt}
                      onChange={(prompt) => editItem('questions', q.id, { prompt })}
                    />
                    <Inline
                      label="Answer outline"
                      rows={4}
                      value={q.answer_outline}
                      onChange={(answer_outline) => editItem('questions', q.id, { answer_outline })}
                    />
                    <div className="question-bottom">
                      <Field label="Difficulty">
                        <Select
                          value={q.difficulty}
                          onChange={(e) =>
                            editItem('questions', q.id, { difficulty: Number(e.target.value) })
                          }
                        >
                          <option value={1}>1 · Foundation</option>
                          <option value={2}>2 · Applied</option>
                          <option value={3}>3 · Deep dive</option>
                        </Select>
                      </Field>
                      <RequirementPicker
                        requirements={kit.role.requirements}
                        value={q.requirement_ids}
                        onChange={(requirement_ids) =>
                          editItem('questions', q.id, { requirement_ids })
                        }
                      />
                    </div>
                  </article>
                );
              })}
            {!kit.questions.length && (
              <div className="empty">
                <h3>No questions yet.</h3>
                <p>Add a question or choose a category to generate from your requirements.</p>
              </div>
            )}
          </>
        )}
        {tab === 'flashcards' && (
          <>
            <div className="section-heading">
              <div>
                <span className="eyebrow">SMALL CARDS. STRONGER RECALL.</span>
                <h2>Your flashcard deck.</h2>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  itemsUpdate('flashcards', [
                    ...kit.flashcards,
                    {
                      id: uid('f'),
                      front: 'Your new flashcard',
                      back: '',
                      requirement_ids: [],
                      origin: 'manual',
                      pinned: false,
                    },
                  ])
                }
              >
                <Plus size={16} /> Add flashcard
              </Button>
            </div>
            <div className="flashcard-grid">
              {kit.flashcards.map((f, i) => (
                <article className="panel" key={f.id}>
                  <div className="question-head">
                    <span className="eyebrow">CARD {String(i + 1).padStart(2, '0')}</span>
                    <div className="grow" />
                    <Tag>
                      {record.practice?.[f.id]
                        ? ['', 'Needs work', 'Getting there', 'Confident'][
                            record.practice[f.id].confidence
                          ]
                        : 'Unseen'}
                    </Tag>
                    <IconButton
                      className="icon-btn"
                      aria-label="Move flashcard up"
                      disabled={i === 0}
                      onClick={() => itemsUpdate('flashcards', shift(kit.flashcards, i, -1))}
                    >
                      <ArrowUp size={15} />
                    </IconButton>
                    <IconButton
                      className="icon-btn"
                      aria-label="Delete flashcard"
                      onClick={() =>
                        itemsUpdate(
                          'flashcards',
                          kit.flashcards.filter((x) => x.id !== f.id),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                  <Inline
                    label="Front"
                    value={f.front}
                    rows={3}
                    onChange={(front) => editItem('flashcards', f.id, { front })}
                  />
                  <Inline
                    label="Back"
                    value={f.back}
                    rows={5}
                    onChange={(back) => editItem('flashcards', f.id, { back })}
                  />
                  <RequirementPicker
                    requirements={kit.role.requirements}
                    value={f.requirement_ids}
                    onChange={(requirement_ids) =>
                      editItem('flashcards', f.id, { requirement_ids })
                    }
                  />
                </article>
              ))}
            </div>
          </>
        )}
        {tab === 'schedule' && (
          <>
            <div className="section-heading">
              <div>
                <span className="eyebrow">ONE DAY AT A TIME</span>
                <h2>A plan you can follow.</h2>
              </div>
              {regenButton('schedule')}
            </div>
            <div className="plan-intro">
              <Field label="Days available">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={kit.schedule.days_available}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    if (days >= 1 && days <= 60 && Number.isInteger(days))
                      update({
                        ...kit,
                        schedule: allocateSchedule(kit.role.requirements, kit.questions, days),
                      });
                  }}
                />
              </Field>
              <p>
                Must-have topics and harder questions come first. Extra days revisit material so you
                remember it.
              </p>
            </div>
            <div className="schedule-list">
              {kit.schedule.days.map((day, i) => (
                <section className="panel schedule-day" key={day.day}>
                  <div className="day-badge">
                    <small>DAY</small>
                    <strong>{String(day.day).padStart(2, '0')}</strong>
                  </div>
                  <div className="grow">
                    <Field label="Focus">
                      <input
                        value={day.focus}
                        onChange={(e) =>
                          update({
                            ...kit,
                            schedule: {
                              ...kit.schedule,
                              days: kit.schedule.days.map((d, j) =>
                                j === i ? { ...d, focus: e.target.value } : d,
                              ),
                            },
                          })
                        }
                      />
                    </Field>
                    <Field label="Questions for this day">
                      <Select
                        multiple
                        value={day.question_ids}
                        onChange={(e) =>
                          update({
                            ...kit,
                            schedule: {
                              ...kit.schedule,
                              days: kit.schedule.days.map((d, j) =>
                                j === i
                                  ? {
                                      ...d,
                                      question_ids: [...e.target.selectedOptions].map(
                                        (o) => o.value,
                                      ),
                                    }
                                  : d,
                              ),
                            },
                          })
                        }
                      >
                        {kit.questions.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.prompt.slice(0, 100)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <small className="muted">Choose multiple questions from the menu.</small>
                  </div>
                  <Field label="Minutes">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={1}
                      value={day.minutes}
                      onChange={(e) =>
                        update({
                          ...kit,
                          schedule: {
                            ...kit.schedule,
                            days: kit.schedule.days.map((d, j) =>
                              j === i ? { ...d, minutes: Number(e.target.value) } : d,
                            ),
                          },
                        })
                      }
                    />
                  </Field>
                </section>
              ))}
            </div>
          </>
        )}
        {tab === 'sources' && (
          <section className="panel">
            <span className="eyebrow">EVIDENCE, NOT GUESSWORK</span>
            <h2>Behind your preparation.</h2>
            <div className="row">
              <Tag>{kit.research?.mode || 'unknown'} generation</Tag>
              <span className="muted">
                Researched {new Date(kit.source.researched_at).toLocaleString()}
              </span>
            </div>
            {kit.research?.warnings.map((w, i) => (
              <Notice key={i} tone="warning">
                {w}
              </Notice>
            ))}
            {kit.research?.sources.map((s, i) => (
              <div className="source-row" key={i}>
                <div>
                  <ExternalLink href={s.url}>{s.title || s.url}</ExternalLink>
                  <small>{s.url}</small>
                  {s.detail && <p className="muted">{s.detail}</p>}
                </div>
                <Tag tone={s.status === 'skipped' ? 'warm' : ''}>{s.status}</Tag>
              </div>
            ))}
            {!kit.research?.sources.length && (
              <p className="muted">
                No sources were retrieved. Company claims could not be verified.
              </p>
            )}
            <p className="muted">
              Public discussion is anecdotal. Confirm interview stages with your recruiter.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
function RequirementPicker({ requirements, value, onChange }) {
  return (
    <details className="requirement-picker">
      <summary>{value.length} linked requirements · edit</summary>
      {requirements.map((r) => (
        <label key={r.id}>
          <input
            type="checkbox"
            checked={value.includes(r.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, r.id] : value.filter((id) => id !== r.id))
            }
          />
          <span>{r.text}</span>
        </label>
      ))}
    </details>
  );
}
