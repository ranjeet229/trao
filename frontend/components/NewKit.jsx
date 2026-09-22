'use client';
import { useEffect, useRef, useState } from 'react';
import { X, ArrowRight, Upload, Sparkles } from 'lucide-react';
import { api, Button, Field, Notice } from './ui';
import IconButton from './IconButton';
export default function NewKit({ onClose, onCreated }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [batch, setBatch] = useState(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (batch) {
        const result = await api('/kits/batch', { method: 'POST', body: JSON.stringify(batch) });
        const failed = result.results.filter((r) => r.error);
        if (failed.length)
          throw new Error(
            `${failed.length} cases could not be queued. Other cases are in your workspace.`,
          );
        onCreated(result.results[0].id);
      } else {
        const fields = Object.fromEntries(new FormData(e.currentTarget));
        const result = await api('/kits', {
          method: 'POST',
          body: JSON.stringify({ ...fields, days: Number(fields.days) }),
        });
        onCreated(result.id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e) {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 500000) throw new Error('Please choose a JSON file under 500 KB.');
      const cases = JSON.parse(await file.text());
      if (
        !Array.isArray(cases) ||
        !cases.length ||
        cases.length > 10 ||
        cases.some(
          (c) =>
            typeof c.jd !== 'string' ||
            typeof c.company_url !== 'string' ||
            !Number.isInteger(c.days) ||
            c.days < 1 ||
            c.days > 60,
        )
      )
        throw new Error('Use an array of 1–10 cases with jd, company_url and days (1–60).');
      setBatch(cases);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <dialog ref={dialog} className="modal" onCancel={onClose}>
      <form onSubmit={submit}>
        <div className="modal-head">
          <span className="eyebrow">
            <Sparkles size={15} /> START WITH AN OPPORTUNITY
          </span>
          <IconButton
            type="button"
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </IconButton>
        </div>
        <h2>Let’s get you ready.</h2>
        <p className="muted">A little context from you. A tailored preparation kit from us.</p>
        {!batch ? (
          <>
            <Field label="Job description">
              <textarea
                name="jd"
                rows={7}
                minLength={5}
                maxLength={30000}
                required
                placeholder={
                  'Paste the full job description here…\n\nInclude responsibilities, requirements and nice-to-haves for the most useful kit.'
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Company website">
                <input name="company_url" type="url" required placeholder="https://company.com" />
              </Field>
              <Field label="Days until your interview">
                <input name="days" type="number" min={1} max={60} defaultValue={7} required />
              </Field>
            </div>
          </>
        ) : (
          <div className="batch-preview">
            <strong>{batch.length} opportunities ready to import</strong>
            {batch.map((c, i) => (
              <p key={i}>
                {c.id || `Role ${i + 1}`} · {c.jd.split('\n')[0]} · {c.days} days
              </p>
            ))}
            <Button variant="ghost" type="button" onClick={() => setBatch(null)}>
              Use one description instead
            </Button>
          </div>
        )}
        <Notice>{error}</Notice>
        <div className="upload-row">
          <label className="upload-link">
            <Upload size={16} /> Import multiple roles
            <input type="file" accept=".json,application/json" onChange={upload} />
          </label>
          <small>JSON · up to 10 roles</small>
        </div>
        <div className="modal-foot">
          <small>We’ll research sources and show you the progress.</small>
          <Button type="submit" busy={busy}>
            Build {batch ? 'my kits' : 'my prep kit'}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </dialog>
  );
}
