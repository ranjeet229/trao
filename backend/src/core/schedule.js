export function checkCoverage(requirements, questions) {
  const covered = new Set(questions.flatMap((q) => q.requirement_ids));
  return requirements.filter((r) => !covered.has(r.id)).map((r) => r.id);
}

// One first encounter per question; then spaced review on otherwise empty days.
export function allocateSchedule(requirements, questions, days) {
  if (!Number.isInteger(days) || days < 1 || days > 60)
    throw new Error('Days must be an integer from 1 to 60.');
  const must = new Set(requirements.filter((r) => r.priority === 'must').map((r) => r.id));
  const sorted = [...questions].sort(
    (a, b) =>
      Number(b.requirement_ids.some((id) => must.has(id))) -
        Number(a.requirement_ids.some((id) => must.has(id))) ||
      b.difficulty - a.difficulty ||
      a.id.localeCompare(b.id),
  );
  const buckets = Array.from({ length: days }, () => []);
  sorted.forEach((q, i) =>
    buckets[Math.min(days - 1, Math.floor((i * days) / Math.max(sorted.length, days)))].push(q),
  );
  return {
    days_available: days,
    days: buckets.map((bucket, i) => {
      const review = bucket.length === 0 && sorted.length > 0;
      const items = review ? [sorted[i % sorted.length]] : bucket;
      return {
        day: i + 1,
        focus: items.length
          ? `${review ? 'Recall & review' : 'Deep practice'}: ${[...new Set(items.map((q) => q.category))].join(', ')}`
          : 'Review the posting and identify questions to ask the recruiter',
        question_ids: items.map((q) => q.id),
        minutes: items.length
          ? items.reduce((n, q) => n + (review ? 5 : q.difficulty * 10), 0)
          : 15,
      };
    }),
  };
}
