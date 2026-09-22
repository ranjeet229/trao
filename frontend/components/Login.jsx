'use client';
import { useState } from 'react';
import { ArrowRight, Sparkles, Check, BookOpen } from 'lucide-react';
import { api, Button, Field, Notice } from './ui';
export default function Login() {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = Object.fromEntries(new FormData(e.currentTarget));
      await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      window.location.assign('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <section className="auth-story">
        <a className="brand" href="/login">
          <span className="brand-icon">
            <BookOpen size={21} />
          </span>
          readyroom<span className="brand-dot">.</span>
        </a>
        <div className="auth-copy">
          <span className="eyebrow">
            <Sparkles size={14} /> A LITTLE PREPARATION. A LOT MORE CONFIDENCE.
          </span>
          <h1>
            Your next chapter
            <br />
            starts <em>prepared.</em>
          </h1>
          <p>
            Turn a job description into a thoughtful plan.
            <br />
            Know the company. Find your focus. Walk in ready.
          </p>
          <div className="auth-checks">
            {[
              'Research that goes beyond the homepage',
              'Practice shaped around your actual role',
              'A realistic plan for the days you have',
            ].map((s) => (
              <div key={s}>
                <Check size={17} />
                {s}
              </div>
            ))}
          </div>
        </div>
        <div className="auth-footer">A calmer way to get to your next opportunity.</div>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
      </section>
      <section className="auth-form">
        <div className="form-wrap">
          <span className="eyebrow">YOUR PREPARATION SPACE</span>
          <h2>{register ? 'Make room for what’s next.' : 'Good to have you back.'}</h2>
          <p className="muted">
            {register
              ? 'Create an account and build your first prep kit.'
              : 'Sign in to pick up where you left off.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <Field label="Your name">
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="Alex Morgan"
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" help={register ? 'At least 10 characters.' : ''}>
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={10}
                maxLength={128}
                required
                placeholder="Enter your password"
              />
            </Field>
            <Notice>{error}</Notice>
            <Button busy={busy} type="submit" className="full">
              {register ? 'Create your account' : 'Sign in'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to Readyroom?'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <div className="private-note">Your kits, notes and progress are private to you.</div>
        </div>
      </section>
    </main>
  );
}
