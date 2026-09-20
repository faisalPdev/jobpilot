import type {
  Bullet,
  CertificationItem,
  ContactInfo,
  EducationItem,
  ExperienceItem,
  LanguageItem,
  ParsedJD,
  ProjectItem,
  SkillGroup,
} from '@/types'
import { move, reindex, stripHtml, uid } from '@/lib/utils'
import { bullet as newBullet } from '@/lib/resumeFactory'
import { rewriteBullet } from '@/lib/ai/tailor'
import { Badge, Button, Hint } from '@/components/ui/primitives'
import { Checkbox, Field, Input, TagInput, Textarea } from '@/components/ui/inputs'
import { RichBullet } from './RichBullet'
import { SortableList, SortableRow } from './SortableList'

/* --------------------------------------------------------------- contact */

export function ContactEditor({
  value,
  onChange,
}: {
  value: ContactInfo
  onChange: (next: ContactInfo) => void
}) {
  const set = <K extends keyof ContactInfo>(key: K, v: ContactInfo[K]) => onChange({ ...value, [key]: v })

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={value.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="Headline" hint="The role you are targeting, not a slogan.">
          <Input
            value={value.headline}
            onChange={(e) => set('headline', e.target.value)}
            placeholder="Senior Backend Engineer"
          />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone" required>
          <Input value={value.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Location">
          <Input
            value={value.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="London, UK"
          />
        </Field>
      </div>

      <div>
        <span className="label">Links</span>
        <div className="space-y-2">
          {value.links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={link.label}
                onChange={(e) => {
                  const links = [...value.links]
                  links[i] = { ...link, label: e.target.value }
                  set('links', links)
                }}
                placeholder="GitHub"
                className="w-32"
              />
              <Input
                value={link.url}
                onChange={(e) => {
                  const links = [...value.links]
                  links[i] = { ...link, url: e.target.value }
                  set('links', links)
                }}
                placeholder="https://github.com/you"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => set('links', value.links.filter((_, idx) => idx !== i))}
                aria-label="Remove link"
              >
                ✕
              </Button>
            </div>
          ))}
          <Button size="sm" onClick={() => set('links', [...value.links, { label: '', url: '' }])}>
            + Add link
          </Button>
        </div>
        <Hint className="mt-1">
          Write links in full with https:// — a bare domain often does not survive text extraction.
        </Hint>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- summary */

export function SummaryEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const words = value.split(/\s+/).filter(Boolean).length
  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Two or three sentences: what you do, the scale you have done it at, and what you want next."
      />
      <div className="mt-1 flex items-center justify-between">
        <Hint>Aim for 2–3 sentences. The tailoring engine rewrites this per job.</Hint>
        <span className={words > 80 ? 'text-xs text-amber-600' : 'text-xs text-ink-400'}>{words} words</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ bullet list */

function BulletList({
  bullets,
  onChange,
  jd,
  placeholder,
}: {
  bullets: Bullet[]
  onChange: (next: Bullet[]) => void
  jd?: ParsedJD | null
  placeholder?: string
}) {
  const update = (id: string, html: string) =>
    onChange(bullets.map((b) => (b.id === id ? { ...b, html } : b)))

  const add = (afterIndex?: number) => {
    const next = [...bullets]
    const at = afterIndex == null ? next.length : afterIndex + 1
    next.splice(at, 0, newBullet('', at))
    onChange(reindex(next))
  }

  const remove = (id: string) => onChange(reindex(bullets.filter((b) => b.id !== id)))

  return (
    <div>
      <SortableList
        items={bullets}
        onReorder={(from, to) => onChange(reindex(move(bullets, from, to)))}
        className="space-y-1"
      >
        {(b, index) => (
          <SortableRow key={b.id} id={b.id} className="group rounded-md pl-7 pr-1 hover:bg-ink-50/60">
            <div className="flex items-start gap-1">
              <span className="mt-1.5 text-ink-300">•</span>
              <RichBullet
                html={b.html}
                onChange={(html) => update(b.id, html)}
                onEnter={() => add(index)}
                onBackspaceEmpty={() => bullets.length > 1 && remove(b.id)}
                placeholder={placeholder}
                className="flex-1"
              />
              <BulletSuggestion html={b.html} jd={jd ?? null} onAccept={(text) => update(b.id, text)} />
              <button
                type="button"
                onClick={() => remove(b.id)}
                className="mt-1 rounded p-1 text-ink-300 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
                aria-label="Delete bullet"
              >
                ✕
              </button>
            </div>
          </SortableRow>
        )}
      </SortableList>
      <Button size="sm" variant="ghost" className="mt-1" onClick={() => add()}>
        + Add bullet
      </Button>
    </div>
  )
}

/**
 * Per-bullet rewriter (§2). Suggestions are shown as an accept/reject diff and
 * are never applied silently.
 */
function BulletSuggestion({
  html,
  jd,
  onAccept,
}: {
  html: string
  jd: ParsedJD | null
  onAccept: (text: string) => void
}) {
  const text = stripHtml(html)
  const suggestion = text.trim().length > 12 ? rewriteBullet(text, jd) : null
  if (!suggestion) return null

  return (
    <details className="group/sug relative mt-0.5">
      <summary
        className="cursor-pointer list-none rounded px-1.5 py-1 text-[10px] font-semibold text-brand-600 opacity-0 transition-opacity hover:bg-brand-50 group-hover:opacity-100"
        title="Suggest a stronger phrasing"
      >
        AI
      </summary>
      <div className="absolute right-0 top-7 z-20 w-96 rounded-xl border border-ink-200 bg-surface p-3 shadow-pop">
        <div className="text-xs font-semibold text-ink-700">Suggested rewrite</div>
        <p className="mt-1.5 rounded bg-rose-50 px-2 py-1 text-xs text-rose-900 line-through">{text}</p>
        <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-900">{suggestion.text}</p>
        <p className="mt-2 text-[11px] text-ink-500">{suggestion.rationale}</p>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={(e) => {
              onAccept(suggestion.text)
              ;(e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')
            }}
          >
            Accept
          </Button>
        </div>
        <Hint className="mt-2">
          Rephrases only what you wrote. It will never add a tool, employer or number that is not already yours.
        </Hint>
      </div>
    </details>
  )
}

/* ------------------------------------------------------------ experience */

export function ExperienceEditor({
  items,
  onChange,
  jd,
}: {
  items: ExperienceItem[]
  onChange: (next: ExperienceItem[]) => void
  jd?: ParsedJD | null
}) {
  const update = (id: string, patch: Partial<ExperienceItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-3">
      <SortableList
        items={items}
        onReorder={(from, to) => onChange(reindex(move(items, from, to)))}
        className="space-y-3"
      >
        {(item) => (
          <SortableRow key={item.id} id={item.id} className="rounded-xl border border-ink-200 bg-surface p-3 pl-8">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Job title">
                <Input value={item.title} onChange={(e) => update(item.id, { title: e.target.value })} />
              </Field>
              <Field label="Company">
                <Input value={item.company} onChange={(e) => update(item.id, { company: e.target.value })} />
              </Field>
              <Field label="Location">
                <Input value={item.location} onChange={(e) => update(item.id, { location: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start" hint="YYYY-MM">
                  <Input
                    type="month"
                    value={item.start_date}
                    onChange={(e) => update(item.id, { start_date: e.target.value })}
                  />
                </Field>
                <Field label="End">
                  <Input
                    type="month"
                    value={item.end_date ?? ''}
                    disabled={item.is_current}
                    onChange={(e) => update(item.id, { end_date: e.target.value || null })}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-1">
              <Checkbox
                checked={item.is_current}
                onChange={(checked) => update(item.id, { is_current: checked, end_date: checked ? null : item.end_date })}
                label="I work here now"
              />
            </div>

            <div className="mt-3">
              <span className="label">Bullets</span>
              <BulletList
                bullets={item.bullets}
                onChange={(bullets) => update(item.id, { bullets })}
                jd={jd}
                placeholder="Rebuilt X, cutting Y from A to B…"
              />
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="danger"
                onClick={() => onChange(reindex(items.filter((i) => i.id !== item.id)))}
              >
                Remove role
              </Button>
            </div>
          </SortableRow>
        )}
      </SortableList>

      <Button
        onClick={() =>
          onChange([
            ...items,
            {
              id: uid('exp'),
              company: '',
              title: '',
              location: '',
              start_date: '',
              end_date: null,
              is_current: false,
              bullets: [newBullet('', 0)],
              order_index: items.length,
            },
          ])
        }
      >
        + Add role
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------- education */

export function EducationEditor({
  items,
  onChange,
}: {
  items: EducationItem[]
  onChange: (next: EducationItem[]) => void
}) {
  const update = (id: string, patch: Partial<EducationItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-3">
      <SortableList
        items={items}
        onReorder={(from, to) => onChange(reindex(move(items, from, to)))}
        className="space-y-3"
      >
        {(item) => (
          <SortableRow key={item.id} id={item.id} className="rounded-xl border border-ink-200 bg-surface p-3 pl-8">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="School">
                <Input value={item.school} onChange={(e) => update(item.id, { school: e.target.value })} />
              </Field>
              <Field label="Degree">
                <Input
                  value={item.degree}
                  onChange={(e) => update(item.id, { degree: e.target.value })}
                  placeholder="BSc"
                />
              </Field>
              <Field label="Field">
                <Input value={item.field} onChange={(e) => update(item.id, { field: e.target.value })} />
              </Field>
              <Field label="Grade">
                <Input
                  value={item.grade}
                  onChange={(e) => update(item.id, { grade: e.target.value })}
                  placeholder="First Class Honours"
                />
              </Field>
              <Field label="Start">
                <Input
                  type="month"
                  value={item.start_date}
                  onChange={(e) => update(item.id, { start_date: e.target.value })}
                />
              </Field>
              <Field label="End">
                <Input
                  type="month"
                  value={item.end_date}
                  onChange={(e) => update(item.id, { end_date: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="danger"
                onClick={() => onChange(reindex(items.filter((i) => i.id !== item.id)))}
              >
                Remove
              </Button>
            </div>
          </SortableRow>
        )}
      </SortableList>

      <Button
        onClick={() =>
          onChange([
            ...items,
            {
              id: uid('edu'),
              school: '',
              degree: '',
              field: '',
              start_date: '',
              end_date: '',
              grade: '',
              order_index: items.length,
            },
          ])
        }
      >
        + Add education
      </Button>
    </div>
  )
}

/* ---------------------------------------------------------------- skills */

export function SkillsEditor({
  groups,
  onChange,
  jdKeywords = [],
}: {
  groups: SkillGroup[]
  onChange: (next: SkillGroup[]) => void
  jdKeywords?: string[]
}) {
  const update = (id: string, patch: Partial<SkillGroup>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  return (
    <div className="space-y-3">
      <SortableList
        items={groups}
        onReorder={(from, to) => onChange(reindex(move(groups, from, to)))}
        className="space-y-3"
      >
        {(group) => (
          <SortableRow key={group.id} id={group.id} className="rounded-xl border border-ink-200 bg-surface p-3 pl-8">
            <div className="flex items-center gap-2">
              <Input
                value={group.category}
                onChange={(e) => update(group.id, { category: e.target.value })}
                className="w-44 font-medium"
                placeholder="Languages"
              />
              <span className="text-xs text-ink-400">{group.skills.length} skills</span>
              <div className="flex-1" />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onChange(reindex(groups.filter((g) => g.id !== group.id)))}
                aria-label="Remove group"
              >
                ✕
              </Button>
            </div>
            <div className="mt-2">
              <TagInput
                value={group.skills}
                onChange={(skills) => update(group.id, { skills })}
                placeholder="Type a skill and press Enter"
                suggestions={jdKeywords}
              />
            </div>
          </SortableRow>
        )}
      </SortableList>

      <Button
        onClick={() => onChange([...groups, { id: uid('sk'), category: 'New group', skills: [], order_index: groups.length }])}
      >
        + Add skill group
      </Button>
      <Hint>
        Group skills so a human can scan them. Only list what you would be comfortable being asked about.
      </Hint>
    </div>
  )
}

/* -------------------------------------------------------------- projects */

export function ProjectsEditor({
  items,
  onChange,
  jd,
}: {
  items: ProjectItem[]
  onChange: (next: ProjectItem[]) => void
  jd?: ParsedJD | null
}) {
  const update = (id: string, patch: Partial<ProjectItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-3">
      <SortableList
        items={items}
        onReorder={(from, to) => onChange(reindex(move(items, from, to)))}
        className="space-y-3"
      >
        {(item) => (
          <SortableRow key={item.id} id={item.id} className="rounded-xl border border-ink-200 bg-surface p-3 pl-8">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Name">
                <Input value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} />
              </Field>
              <Field label="Your role">
                <Input value={item.role} onChange={(e) => update(item.id, { role: e.target.value })} />
              </Field>
              <Field label="URL" className="sm:col-span-2">
                <Input value={item.url} onChange={(e) => update(item.id, { url: e.target.value })} />
              </Field>
              <Field label="One-line description" className="sm:col-span-2">
                <Input value={item.description} onChange={(e) => update(item.id, { description: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3">
              <span className="label">Bullets</span>
              <BulletList bullets={item.bullets} onChange={(bullets) => update(item.id, { bullets })} jd={jd} />
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="danger"
                onClick={() => onChange(reindex(items.filter((i) => i.id !== item.id)))}
              >
                Remove project
              </Button>
            </div>
          </SortableRow>
        )}
      </SortableList>

      <Button
        onClick={() =>
          onChange([
            ...items,
            {
              id: uid('proj'),
              name: '',
              role: '',
              url: '',
              description: '',
              bullets: [newBullet('', 0)],
              order_index: items.length,
            },
          ])
        }
      >
        + Add project
      </Button>
    </div>
  )
}

/* -------------------------------------------------------- certifications */

export function CertificationsEditor({
  items,
  onChange,
}: {
  items: CertificationItem[]
  onChange: (next: CertificationItem[]) => void
}) {
  const update = (id: string, patch: Partial<CertificationItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-ink-200 p-2">
          <Field label="Certification" className="min-w-[12rem] flex-1">
            <Input value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} />
          </Field>
          <Field label="Issuer" className="min-w-[9rem] flex-1">
            <Input value={item.issuer} onChange={(e) => update(item.id, { issuer: e.target.value })} />
          </Field>
          <Field label="Year" className="w-24">
            <Input value={item.issued_on} onChange={(e) => update(item.id, { issued_on: e.target.value })} />
          </Field>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange(reindex(items.filter((i) => i.id !== item.id)))}
            aria-label="Remove certification"
          >
            ✕
          </Button>
        </div>
      ))}
      <Button
        onClick={() =>
          onChange([...items, { id: uid('cert'), name: '', issuer: '', issued_on: '', order_index: items.length }])
        }
      >
        + Add certification
      </Button>
      <Hint>
        Only real credentials. The truthfulness validator flags any certification in generated text that is not here.
      </Hint>
    </div>
  )
}

/* ------------------------------------------------------------- languages */

const PROFICIENCIES: LanguageItem['proficiency'][] = [
  'Native',
  'Fluent',
  'Professional',
  'Conversational',
  'Basic',
]

export function LanguagesEditor({
  items,
  onChange,
}: {
  items: LanguageItem[]
  onChange: (next: LanguageItem[]) => void
}) {
  const update = (id: string, patch: Partial<LanguageItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-end gap-2">
          <Field label="Language" className="flex-1">
            <Input value={item.language} onChange={(e) => update(item.id, { language: e.target.value })} />
          </Field>
          <Field label="Proficiency" className="w-40">
            <select
              className="input-base"
              value={item.proficiency}
              onChange={(e) => update(item.id, { proficiency: e.target.value as LanguageItem['proficiency'] })}
            >
              {PROFICIENCIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onChange(reindex(items.filter((i) => i.id !== item.id)))}
            aria-label="Remove language"
          >
            ✕
          </Button>
        </div>
      ))}
      <Button
        onClick={() =>
          onChange([
            ...items,
            { id: uid('lang'), language: '', proficiency: 'Professional', order_index: items.length },
          ])
        }
      >
        + Add language
      </Button>
    </div>
  )
}

export function SectionBadge({ count }: { count: number }) {
  return (
    <Badge tone={count ? 'neutral' : 'warning'} className="ml-2">
      {count ? `${count}` : 'empty'}
    </Badge>
  )
}
