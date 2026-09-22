import { z } from 'zod';

export const categories = ['technical', 'behavioural', 'system-design', 'company-fit'];
const text = z.string().max(20000);
const id = z.string().min(1).max(100);
const ids = z.array(id).max(300);
const state = {
  origin: z.enum(['generated', 'manual', 'edited']).default('generated'),
  pinned: z.boolean().default(false),
};
export const requirementSchema = z.object({
  id,
  text: text.min(1),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});
export const questionSchema = z.object({
  id,
  requirement_ids: ids,
  category: z.enum(categories),
  prompt: text.min(1),
  answer_outline: text,
  difficulty: z.number().int().min(1).max(3),
  ...state,
});
export const flashcardSchema = z.object({
  id,
  front: text.min(1),
  back: text,
  requirement_ids: ids,
  ...state,
});
export const roleSchema = z.object({
  title: text,
  seniority: text,
  responsibilities: z.array(text).max(100),
  requirements: z.array(requirementSchema).max(150),
});
export const briefSchema = z.object({
  summary: text,
  what_they_do: text,
  sources: z.array(z.string().url()).max(50),
});
export const kitSchema = z
  .object({
    draft: z.boolean().optional(),
    source: z.object({
      company: text,
      company_url: text,
      role: text,
      location: text,
      jd_chars: z.number().int().nonnegative(),
      researched_at: z.string().datetime(),
      pages_used: z.array(z.string().url()).max(50),
    }),
    company_brief: briefSchema,
    role: roleSchema,
    questions: z.array(questionSchema).max(500),
    flashcards: z.array(flashcardSchema).max(500),
    schedule: z.object({
      days_available: z.number().int().min(1).max(60),
      days: z
        .array(
          z.object({
            day: z.number().int().positive(),
            focus: text,
            question_ids: ids,
            minutes: z.number().int().nonnegative().max(10000),
          }),
        )
        .max(60),
    }),
    coverage: z.object({ uncovered_requirement_ids: ids, passes: z.number().int().nonnegative() }),
    research: z
      .object({
        warnings: z.array(text),
        sources: z.array(
          z.object({
            url: z.string(),
            title: text,
            kind: text,
            status: text,
            detail: text.optional(),
          }),
        ),
        hiring_process: text,
        mode: z.enum(['ai', 'fallback', 'mixed']),
      })
      .optional(),
  })
  .superRefine((kit, ctx) => {
    const issue = (message) => ctx.addIssue({ code: 'custom', message });
    const rids = new Set(kit.role.requirements.map((r) => r.id));
    const qids = new Set(kit.questions.map((q) => q.id));
    if (
      rids.size !== kit.role.requirements.length ||
      qids.size !== kit.questions.length ||
      new Set(kit.flashcards.map((f) => f.id)).size !== kit.flashcards.length
    )
      issue('IDs must be unique within each collection.');
    for (const item of [...kit.questions, ...kit.flashcards])
      if (item.requirement_ids.some((r) => !rids.has(r))) issue('Unknown requirement reference.');
    if (kit.schedule.days.length !== kit.schedule.days_available)
      issue('Schedule must contain exactly the requested days.');
    kit.schedule.days.forEach((day, i) => {
      if (day.day !== i + 1) issue('Schedule days must be sequential.');
      if (day.question_ids.some((q) => !qids.has(q))) issue('Unknown scheduled question.');
    });
    const covered = new Set(kit.questions.flatMap((q) => q.requirement_ids));
    const missing = kit.role.requirements
      .filter((r) => !covered.has(r.id))
      .map((r) => r.id)
      .sort();
    if (
      JSON.stringify([...kit.coverage.uncovered_requirement_ids].sort()) !== JSON.stringify(missing)
    )
      issue('Coverage does not match actual questions.');
    const scheduledIds = new Set(kit.schedule.days.flatMap((d) => d.question_ids));
    const scheduledRequirements = new Set(
      kit.questions.filter((q) => scheduledIds.has(q.id)).flatMap((q) => q.requirement_ids),
    );
    if (!kit.draft)
      for (const r of kit.role.requirements.filter((r) => r.priority === 'must'))
        if (!scheduledRequirements.has(r.id)) issue(`Must-have ${r.id} is not scheduled.`);
  });
export const inputSchema = z.object({
  jd: z.string().trim().min(5).max(30000),
  company_url: z.string().trim().min(1).max(2048),
  days: z.number().int().min(1).max(60),
});
export function validateKit(kit) {
  return kitSchema.parse(kit);
}
