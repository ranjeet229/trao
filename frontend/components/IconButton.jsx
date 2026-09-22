'use client';

export default function IconButton({ children, className = 'icon-btn', ...props }) {
  return (
    <span className="icon-control">
      <button type="button" {...props} className={className}>
        {children}
      </button>
    </span>
  );
}
