'use client';
import { cloneElement, useId } from 'react';
import { LoaderCircle, AlertCircle, ArrowUpRight } from 'lucide-react';
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'Readyroom',
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.location.assign('/login');
    const error = new Error(data.error?.message || 'Something went wrong. Please try again.');
    error.code = data.error?.code;
    throw error;
  }
  return data;
}
export function Button({ children, variant = 'primary', busy = false, className = '', ...props }) {
  return (
    <button className={`btn ${variant} ${className}`} disabled={busy || props.disabled} {...props}>
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Notice({ children, tone = 'error' }) {
  return children ? (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  ) : null;
}
export function Field({ label, help, children }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span id={`${id}-label`}>{label}</span>
      {cloneElement(children, {
        id,
        'aria-labelledby': `${id}-label`,
        'aria-describedby': help ? `${id}-help` : undefined,
      })}
      {help && <small id={`${id}-help`}>{help}</small>}
    </label>
  );
}
export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon size={26} />
        </div>
      )}
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Tag({ children, tone = '' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
export function ExternalLink({ href, children }) {
  let safe = false;
  try {
    safe = ['http:', 'https:'].includes(new URL(href).protocol);
  } catch {}
  return safe ? (
    <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
