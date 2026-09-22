'use client';
import { Children, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

const labels = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  domain: 'Domain',
  'system-design': 'System design',
  'company-fit': 'Company fit',
};

// A themed listbox: same value/change contract as the existing select controls.
export default function Select({
  children,
  value,
  onChange,
  multiple = false,
  disabled = false,
  id,
  ...props
}) {
  const generatedId = useId();
  const listId = `${id || generatedId}-options`;
  const trigger = useRef(null),
    popup = useRef(null),
    typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [position, setPosition] = useState(null);
  const options = Children.toArray(children).map((option) => ({
    value: String(option.props.value ?? option.props.children),
    label: labels[option.props.children] || option.props.children,
  }));
  const selected = multiple ? (value || []).map(String) : [String(value)];
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => selected.includes(option.value)),
  );
  const text = multiple
    ? `${selected.length} question${selected.length === 1 ? '' : 's'} selected`
    : options.find((option) => selected.includes(option.value))?.label || 'Select an option';
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = trigger.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12,
        above = rect.top - 12;
      const up = below < 180 && above > below;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 24);
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
        maxHeight: Math.max(90, Math.min(280, up ? above : below)),
        ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const outside = (e) => {
      if (!trigger.current?.contains(e.target) && !popup.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, open, position?.top]);
  function choose(index) {
    const option = options[index];
    if (!option) return;
    const values = multiple
      ? selected.includes(option.value)
        ? selected.filter((v) => v !== option.value)
        : [...selected, option.value]
      : [option.value];
    onChange?.({
      target: { value: option.value, selectedOptions: values.map((value) => ({ value })) },
    });
    if (!multiple) setOpen(false);
  }
  function keyboard(e) {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (!open) {
        setActive(e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : selectedIndex);
        setOpen(true);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') choose(active);
      else
        setActive(
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? options.length - 1
              : Math.max(
                  0,
                  Math.min(options.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)),
                ),
        );
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      typed.current = {
        text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(),
        at: now,
      };
      const match = options.findIndex((option) =>
        String(option.label).toLowerCase().startsWith(typed.current.text),
      );
      if (match >= 0) {
        setActive(match);
        setOpen(true);
      }
    }
  }
  return (
    <div className={`themed-select ${multiple ? 'multi-select' : ''}`}>
      <button
        {...props}
        id={id}
        ref={trigger}
        type="button"
        role="combobox"
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onKeyDown={keyboard}
        onBlur={(e) => {
          if (!popup.current?.contains(e.relatedTarget)) setOpen(false);
        }}
        onClick={() => {
          setActive(selectedIndex);
          setOpen(!open);
        }}
      >
        <span>{text}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popup}
            id={listId}
            role="listbox"
            aria-label={props['aria-label'] || 'Options'}
            aria-labelledby={props['aria-labelledby']}
            aria-multiselectable={multiple || undefined}
            className="select-menu"
            style={position}
          >
            {multiple && (
              <div className="select-hint">Select all questions you want to include</div>
            )}
            {options.length ? (
              options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected.includes(option.value)}
                  className={`select-option ${active === index ? 'highlighted' : ''}`}
                  onPointerMove={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    choose(index);
                    trigger.current?.focus();
                  }}
                >
                  <span>{option.label}</span>
                  <Check
                    size={15}
                    className={selected.includes(option.value) ? '' : 'invisible'}
                    aria-hidden="true"
                  />
                </div>
              ))
            ) : (
              <div className="select-hint">No questions available yet</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
