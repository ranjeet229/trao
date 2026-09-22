import { allocateSchedule, checkCoverage } from './schedule.js';
export function mergeCategory(kit, category, generated) {
  const keep = kit.questions.filter(
    (q) => q.category !== category || q.origin === 'manual' || q.origin === 'edited' || q.pinned,
  );
  const protectedRequirements = new Set(
    keep.filter((q) => q.category === category).flatMap((q) => q.requirement_ids),
  );
  const used = new Set(keep.map((q) => q.id));
  const replacements = generated
    .filter(
      (q) =>
        !q.requirement_ids.length || q.requirement_ids.some((r) => !protectedRequirements.has(r)),
    )
    .map((q) => {
      let next = q.id;
      let i = 1;
      while (used.has(next)) next = `${q.id}-${i++}`;
      used.add(next);
      return { ...q, id: next };
    });
  const questions = [...keep, ...replacements];
  return {
    ...kit,
    questions,
    coverage: {
      ...kit.coverage,
      uncovered_requirement_ids: checkCoverage(kit.role.requirements, questions),
    },
    schedule: reconcileSchedule(kit, questions),
  };
}
// Preserve hand-edited day focus/duration and the positions of surviving questions.
// Replace deleted generated IDs by requirement overlap; allocate only new material.
export function reconcileSchedule(kit, questions) {
  const existing = new Set(questions.map((q) => q.id));
  const days = kit.schedule.days.map((day) => ({
    ...day,
    question_ids: [
      ...new Set(
        day.question_ids.flatMap((id) => {
          if (existing.has(id)) return [id];
          const old = kit.questions.find((q) => q.id === id);
          return questions
            .filter((q) => old?.requirement_ids.some((r) => q.requirement_ids.includes(r)))
            .map((q) => q.id);
        }),
      ),
    ],
  }));
  const allocated = new Set(days.flatMap((d) => d.question_ids));
  for (const question of questions)
    if (!allocated.has(question.id)) {
      days[0].question_ids.push(question.id);
      allocated.add(question.id);
    }
  return { ...kit.schedule, days };
}
export function normalizeKit(kit) {
  return {
    ...kit,
    coverage: {
      ...kit.coverage,
      uncovered_requirement_ids: checkCoverage(kit.role.requirements, kit.questions),
    },
    schedule: allocateSchedule(kit.role.requirements, kit.questions, kit.schedule.days_available),
  };
}
