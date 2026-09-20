/**
 * Demo data. Enough history for the analytics module to say something real:
 * ~10 weeks of applications, a master resume and two tailored variants, and a
 * status history with plausible time-in-stage gaps.
 */
import type {
  Application,
  ApplicationSource,
  ApplicationStatus,
  DiscoveredJob,
  JobDescription,
  Resume,
  ResumeContent,
  ResumeVersion,
  SavedSearch,
  StatusTransition,
  User,
} from '@/types'
import type { Db as DbShape } from './db'
import { emptyDb } from './db'
import { daysAgoIso, daysFromNowIso, uid } from '../utils'
import { DEFAULT_SECTION_ORDER, bullet } from '../resumeFactory'
import { parseJobDescription } from '../ai/jd'
import { matchResumeToJD, matchReasons } from '../ai/match'
import { JD_SAMPLES } from './jdSamples'

export const DEMO_EMAIL = 'demo@jobpilot.app'
export const DEMO_PASSWORD = 'demo1234'

function masterContent(): ResumeContent {
  return {
    contact: {
      full_name: 'Ayesha Raman',
      headline: 'Backend Engineer',
      email: 'ayesha.raman@example.com',
      phone: '+44 7700 900312',
      location: 'London, UK',
      links: [
        { label: 'GitHub', url: 'https://github.com/ayesharaman' },
        { label: 'LinkedIn', url: 'https://linkedin.com/in/ayesharaman' },
      ],
    },
    summary:
      'Backend engineer with six years building Python services on Postgres. I like the unglamorous work: query plans, retry semantics, and making a deploy boring.',
    experience: [
      {
        id: uid('exp'),
        company: 'Ledgerline',
        title: 'Senior Software Engineer',
        location: 'London, UK',
        start_date: '2023-04',
        end_date: null,
        is_current: true,
        order_index: 0,
        bullets: [
          bullet('Rebuilt the payment reconciliation service in FastAPI, cutting nightly batch time from 4 hours to 38 minutes', 0),
          bullet('Responsible for the Postgres migration from a single 2TB instance to a partitioned schema with zero downtime', 1),
          bullet('Introduced pytest contract tests across 6 internal services, taking production incidents from 9 to 2 per quarter', 2),
          bullet('Mentored two mid-level engineers through their first on-call rotations', 3),
          bullet('Cut AWS spend on the ingestion pipeline by 31% by moving hot paths to Redis and batching writes', 4),
        ],
      },
      {
        id: uid('exp'),
        company: 'Fernwood Analytics',
        title: 'Software Engineer',
        location: 'Manchester, UK',
        start_date: '2021-01',
        end_date: '2023-03',
        is_current: false,
        order_index: 1,
        bullets: [
          bullet('Built the REST API powering the customer dashboard, serving 1.2M requests a day at p99 under 180ms', 0),
          bullet('Worked on the Celery task graph that drove nightly reporting for 400 enterprise accounts', 1),
          bullet('Containerised 11 legacy services with Docker and moved CI to GitHub Actions, dropping build times 62%', 2),
          bullet('Wrote the incident runbooks and set up Grafana dashboards the on-call team still uses', 3),
        ],
      },
      {
        id: uid('exp'),
        company: 'Tessellate',
        title: 'Junior Developer',
        location: 'Remote',
        start_date: '2019-08',
        end_date: '2020-12',
        is_current: false,
        order_index: 2,
        bullets: [
          bullet('Shipped features across a Django monolith used by 30,000 monthly users', 0),
          bullet('Helped with the SQL reporting layer, adding indexes that took the slowest report from 40s to 900ms', 1),
        ],
      },
    ],
    education: [
      {
        id: uid('edu'),
        school: 'University of Manchester',
        degree: 'BSc',
        field: 'Computer Science',
        start_date: '2016-09',
        end_date: '2019-06',
        grade: 'First Class Honours',
        order_index: 0,
      },
    ],
    skills: [
      { id: uid('sk'), category: 'Languages', skills: ['Python', 'SQL', 'TypeScript', 'Bash'], order_index: 0 },
      { id: uid('sk'), category: 'Frameworks', skills: ['FastAPI', 'Django', 'Celery', 'React'], order_index: 1 },
      { id: uid('sk'), category: 'Data', skills: ['PostgreSQL', 'Redis', 'pandas'], order_index: 2 },
      { id: uid('sk'), category: 'Infrastructure', skills: ['Docker', 'GitHub Actions', 'AWS', 'Grafana'], order_index: 3 },
      { id: uid('sk'), category: 'Practices', skills: ['Testing', 'System design', 'Mentoring', 'Code review'], order_index: 4 },
    ],
    projects: [
      {
        id: uid('proj'),
        name: 'pgslowlog',
        role: 'Author',
        url: 'https://github.com/ayesharaman/pgslowlog',
        description: 'A small CLI that turns Postgres slow query logs into a ranked, deduplicated report.',
        order_index: 0,
        bullets: [
          bullet('Used by 240 GitHub stars worth of strangers; parses 1GB of logs in under 3 seconds', 0),
          bullet('Built with Python and click, tested with pytest, published to PyPI with GitHub Actions', 1),
        ],
      },
    ],
    certifications: [
      {
        id: uid('cert'),
        name: 'AWS Certified Solutions Architect – Associate',
        issuer: 'Amazon Web Services',
        issued_on: '2024',
        order_index: 0,
      },
    ],
    languages: [
      { id: uid('lang'), language: 'English', proficiency: 'Native', order_index: 0 },
      { id: uid('lang'), language: 'Tamil', proficiency: 'Fluent', order_index: 1 },
      { id: uid('lang'), language: 'German', proficiency: 'Basic', order_index: 2 },
    ],
    section_order: [...DEFAULT_SECTION_ORDER],
    hidden_sections: [],
  }
}

interface SeedApp {
  company: string
  role: string
  location: string
  source: ApplicationSource
  status: ApplicationStatus
  daysAgo: number
  /** Days after applying that each transition happened, in pipeline order. */
  path: { status: ApplicationStatus; afterDays: number }[]
  tailored: boolean
  salary: string
  match: number | null
  jdKey?: string
}

const SEED_APPS: SeedApp[] = [
  { company: 'Nimbus Labs', role: 'Senior Backend Engineer', location: 'Remote (UK/EU)', source: 'Greenhouse', status: 'Interview', daysAgo: 21, path: [{ status: 'Screening', afterDays: 4 }, { status: 'Interview', afterDays: 11 }], tailored: true, salary: '£95k - £125k', match: 78, jdKey: 'nimbus-senior-backend' },
  { company: 'HarborStack', role: 'Full-Stack Engineer', location: 'Bengaluru (Hybrid)', source: 'Lever', status: 'Screening', daysAgo: 12, path: [{ status: 'Screening', afterDays: 6 }], tailored: true, salary: '₹28L - ₹38L', match: 64, jdKey: 'harborstack-fullstack' },
  { company: 'Quantile AI', role: 'ML Engineer, LLM Platform', location: 'Remote (Global)', source: 'Ashby', status: 'Rejected', daysAgo: 34, path: [{ status: 'Screening', afterDays: 5 }, { status: 'Rejected', afterDays: 13 }], tailored: false, salary: '$180k - $230k', match: 41, jdKey: 'quantile-ml' },
  { company: 'Orbitworks', role: 'Frontend Engineer, Design Systems', location: 'Remote (Americas)', source: 'RemoteOK', status: 'Applied', daysAgo: 6, path: [], tailored: false, salary: '$150k - $185k', match: 52, jdKey: 'orbitworks-frontend' },
  { company: 'Meridian Health', role: 'Senior Product Manager, Platform', location: 'London, UK', source: 'Company site', status: 'Saved', daysAgo: 3, path: [], tailored: false, salary: '£85k - £105k', match: 38, jdKey: 'meridian-pm' },
  { company: 'Northbridge Systems', role: 'Backend Engineer', location: 'London, UK', source: 'Referral', status: 'Offer', daysAgo: 45, path: [{ status: 'Screening', afterDays: 3 }, { status: 'Interview', afterDays: 9 }, { status: 'Offer', afterDays: 26 }], tailored: true, salary: '£105k', match: 81 },
  { company: 'Kestrel Data', role: 'Platform Engineer', location: 'Remote (EU)', source: 'LinkedIn', status: 'Rejected', daysAgo: 52, path: [{ status: 'Rejected', afterDays: 18 }], tailored: false, salary: '', match: 46 },
  { company: 'Vantage Pay', role: 'Senior Python Engineer', location: 'London, UK', source: 'LinkedIn', status: 'Rejected', daysAgo: 48, path: [{ status: 'Screening', afterDays: 7 }, { status: 'Rejected', afterDays: 15 }], tailored: false, salary: '£100k', match: 69 },
  { company: 'Solenne', role: 'Backend Engineer', location: 'Paris, FR', source: 'Indeed', status: 'Rejected', daysAgo: 41, path: [{ status: 'Rejected', afterDays: 21 }], tailored: false, salary: '', match: 55 },
  { company: 'Trellis Health', role: 'Senior Engineer, Data Platform', location: 'Remote (UK)', source: 'Greenhouse', status: 'Interview', daysAgo: 28, path: [{ status: 'Screening', afterDays: 5 }, { status: 'Interview', afterDays: 14 }], tailored: false, salary: '£110k', match: 74 },
  { company: 'Arcadia Retail', role: 'Backend Engineer', location: 'Manchester, UK', source: 'Company site', status: 'Withdrawn', daysAgo: 38, path: [{ status: 'Screening', afterDays: 6 }, { status: 'Withdrawn', afterDays: 12 }], tailored: false, salary: '£78k', match: 61 },
  { company: 'Fenwick Digital', role: 'Python Developer', location: 'Remote (UK)', source: 'Indeed', status: 'Applied', daysAgo: 9, path: [], tailored: false, salary: '', match: 49 },
  { company: 'Wavelet', role: 'Senior Backend Engineer', location: 'Berlin, DE', source: 'Lever', status: 'Screening', daysAgo: 15, path: [{ status: 'Screening', afterDays: 8 }], tailored: true, salary: '€95k', match: 72 },
  { company: 'Halcyon Labs', role: 'Staff Engineer', location: 'Remote (Global)', source: 'Referral', status: 'Interview', daysAgo: 19, path: [{ status: 'Screening', afterDays: 2 }, { status: 'Interview', afterDays: 8 }], tailored: true, salary: '$210k', match: 76 },
  { company: 'Bramble', role: 'Backend Engineer', location: 'London, UK', source: 'LinkedIn', status: 'Applied', daysAgo: 4, path: [], tailored: false, salary: '', match: 58 },
  { company: 'Cindermill', role: 'Senior Engineer', location: 'Remote (EU)', source: 'RemoteOK', status: 'Rejected', daysAgo: 31, path: [{ status: 'Rejected', afterDays: 12 }], tailored: false, salary: '', match: 44 },
  { company: 'Portside', role: 'API Engineer', location: 'Dublin, IE', source: 'Ashby', status: 'Applied', daysAgo: 7, path: [], tailored: true, salary: '€85k', match: 67 },
  { company: 'Greyfield', role: 'Backend Engineer', location: 'London, UK', source: 'Adzuna', status: 'Rejected', daysAgo: 26, path: [{ status: 'Rejected', afterDays: 9 }], tailored: false, salary: '£88k', match: 51 },
  { company: 'Sunderly', role: 'Senior Backend Engineer', location: 'Remote (UK)', source: 'Referral', status: 'Screening', daysAgo: 11, path: [{ status: 'Screening', afterDays: 4 }], tailored: true, salary: '£112k', match: 79 },
  { company: 'Ironvale', role: 'Software Engineer II', location: 'Leeds, UK', source: 'Indeed', status: 'Rejected', daysAgo: 44, path: [{ status: 'Rejected', afterDays: 25 }], tailored: false, salary: '', match: 47 },
  { company: 'Marlowe Tech', role: 'Backend Engineer', location: 'Remote (UK)', source: 'LinkedIn', status: 'Applied', daysAgo: 2, path: [], tailored: false, salary: '', match: 53 },
  { company: 'Petrichor', role: 'Senior Platform Engineer', location: 'Amsterdam, NL', source: 'Greenhouse', status: 'Applied', daysAgo: 5, path: [], tailored: true, salary: '€105k', match: 71 },
]

const DISCOVERED: {
  company: string
  role: string
  location: string
  remote: boolean
  channel: ApplicationSource
  salary: string | null
  score: number
  status: DiscoveredJob['status']
  hoursAgo: number
}[] = [
  { company: 'Wren Systems', role: 'Senior Backend Engineer (Python)', location: 'Remote (UK)', remote: true, channel: 'Greenhouse', salary: '£105k - £130k', score: 84, status: 'new', hoursAgo: 5 },
  { company: 'Falkirk Data', role: 'Platform Engineer, Postgres', location: 'Edinburgh, UK', remote: false, channel: 'Lever', salary: '£95k - £115k', score: 79, status: 'new', hoursAgo: 9 },
  { company: 'Onward Health', role: 'Senior Python Engineer', location: 'Remote (EU)', remote: true, channel: 'Ashby', salary: '€100k', score: 76, status: 'drafted', hoursAgo: 26 },
  { company: 'Bellwether', role: 'Backend Engineer, Payments', location: 'London, UK', remote: false, channel: 'Greenhouse', salary: '£90k - £110k', score: 72, status: 'reviewed', hoursAgo: 30 },
  { company: 'Quietstone', role: 'Staff Backend Engineer', location: 'Remote (Global)', remote: true, channel: 'RemoteOK', salary: '$190k - $220k', score: 68, status: 'new', hoursAgo: 34 },
  { company: 'Copperline', role: 'Full-Stack Engineer', location: 'Remote (UK)', remote: true, channel: 'Adzuna', salary: null, score: 61, status: 'dismissed', hoursAgo: 50 },
  { company: 'Tidewell', role: 'Senior Engineer, Data Infrastructure', location: 'Bristol, UK', remote: false, channel: 'Lever', salary: '£100k', score: 66, status: 'new', hoursAgo: 58 },
]

const SYNTHETIC_JD = (company: string, role: string, location: string, salary: string) => `${role}
${company} · ${location}

What you'll do
- Own backend services in Python, deployed with Docker on AWS
- Design PostgreSQL schemas and keep queries fast as data grows
- Build REST APIs consumed by internal and partner teams
- Improve CI/CD and testing discipline across the team

What you'll need
- 5+ years of backend engineering in Python (FastAPI or Django)
- Strong PostgreSQL and SQL
- Experience with Docker, CI/CD and cloud infrastructure
- Solid system design fundamentals

Nice to have
- Redis, Celery
- Kubernetes
- Terraform
- Observability tooling

${salary ? `Compensation: ${salary}.` : ''}`

export function buildSeedDb(): DbShape {
  const db = emptyDb()
  const userId = uid('usr')

  const user: User & { password: string } = {
    id: userId,
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    full_name: 'Ayesha Raman',
    created_at: daysAgoIso(120),
    follow_up_days: 7,
    weekly_application_goal: 10,
    llm_data_consent: true,
  }
  db.users.push(user)

  /* ------------------------------------------------------- master resume */
  const masterId = uid('res')
  const v1Id = uid('rv')
  const v2Id = uid('rv')
  const content = masterContent()

  const olderContent: ResumeContent = JSON.parse(JSON.stringify(content))
  olderContent.summary = 'Backend engineer with experience in Python and Postgres.'
  olderContent.experience[0].bullets = olderContent.experience[0].bullets.slice(0, 3)

  const versions: ResumeVersion[] = [
    { id: v1Id, resume_id: masterId, version_number: 1, content: olderContent, label: 'Imported from PDF', created_at: daysAgoIso(96) },
    { id: v2Id, resume_id: masterId, version_number: 2, content, label: 'Added metrics to Ledgerline bullets', created_at: daysAgoIso(58) },
  ]
  const master: Resume = {
    id: masterId,
    user_id: userId,
    title: 'Master resume',
    is_master: true,
    template_id: 'ats-classic',
    tailored_from_resume_id: null,
    job_description_id: null,
    current_version_id: v2Id,
    created_at: daysAgoIso(96),
    updated_at: daysAgoIso(58),
  }
  db.resumes.push(master)
  db.resume_versions.push(...versions)

  /* ------------------------------------------------- job descriptions */
  const jdByKey = new Map<string, JobDescription>()
  JD_SAMPLES.forEach((sample, i) => {
    const parsed = parseJobDescription(sample.text, sample.url)
    const jd: JobDescription = {
      id: uid('jd'),
      user_id: userId,
      source_url: sample.url,
      source: sample.channel,
      raw_text: sample.text,
      parsed,
      company_name: parsed.company_name,
      role_title: parsed.role_title,
      created_at: daysAgoIso(30 - i * 3),
    }
    db.job_descriptions.push(jd)
    jdByKey.set(sample.key, jd)
  })

  /* ---------------------------------------- tailored resume variants */
  const tailoredFor = (jd: JobDescription, title: string, daysAgo: number) => {
    const resumeId = uid('res')
    const versionId = uid('rv')
    const tailoredContent: ResumeContent = JSON.parse(JSON.stringify(content))
    tailoredContent.contact.headline = jd.parsed.role_title.replace(/\s*[-|(].*$/, '')
    tailoredContent.summary = `${jd.parsed.role_title} candidate with 6+ years of experience targeting ${jd.company_name}. ${content.summary}`
    db.resume_versions.push({
      id: versionId,
      resume_id: resumeId,
      version_number: 1,
      content: tailoredContent,
      label: `Tailored for ${jd.company_name}`,
      created_at: daysAgoIso(daysAgo),
    })
    db.resumes.push({
      id: resumeId,
      user_id: userId,
      title,
      is_master: false,
      template_id: 'ats-modern',
      tailored_from_resume_id: masterId,
      job_description_id: jd.id,
      current_version_id: versionId,
      created_at: daysAgoIso(daysAgo),
      updated_at: daysAgoIso(daysAgo),
    })
    return { resumeId, versionId }
  }

  const nimbusJd = jdByKey.get('nimbus-senior-backend')!
  const harborJd = jdByKey.get('harborstack-fullstack')!
  const nimbusResume = tailoredFor(nimbusJd, 'Nimbus Labs — Senior Backend', 22)
  const harborResume = tailoredFor(harborJd, 'HarborStack — Full-Stack', 13)

  /* ---------------------------------------------------- applications */
  const history: StatusTransition[] = []
  SEED_APPS.forEach((seed, index) => {
    const appId = uid('app')
    const appliedAt = seed.status === 'Saved' ? null : daysAgoIso(seed.daysAgo)
    const jd = seed.jdKey ? jdByKey.get(seed.jdKey) : undefined
    const jdText = jd?.raw_text ?? SYNTHETIC_JD(seed.company, seed.role, seed.location, seed.salary)

    let resumeId: string | null = master.id
    let versionId: string | null = master.current_version_id
    if (seed.tailored) {
      if (seed.jdKey === 'nimbus-senior-backend') {
        resumeId = nimbusResume.resumeId
        versionId = nimbusResume.versionId
      } else if (seed.jdKey === 'harborstack-fullstack') {
        resumeId = harborResume.resumeId
        versionId = harborResume.versionId
      } else {
        // Other tailored sends used a variant that has since been superseded;
        // the tracker still points at the exact version that was sent.
        resumeId = nimbusResume.resumeId
        versionId = nimbusResume.versionId
      }
    }

    const lastTransitionDay =
      seed.path.length > 0 ? seed.daysAgo - seed.path[seed.path.length - 1].afterDays : seed.daysAgo
    const isOpen = !['Rejected', 'Withdrawn', 'Offer'].includes(seed.status)

    const app: Application = {
      id: appId,
      user_id: userId,
      job_description_id: jd?.id ?? null,
      company_name: seed.company,
      role_title: seed.role,
      location: seed.location,
      source: seed.source,
      status: seed.status,
      resume_id: resumeId,
      resume_version_id: versionId,
      cover_letter_id: null,
      match_score: seed.match,
      salary_text: seed.salary,
      applied_at: appliedAt,
      next_follow_up_at:
        isOpen && appliedAt ? daysFromNowIso(-(lastTransitionDay - user.follow_up_days)) : null,
      board_index: index,
      contacts:
        seed.source === 'Referral'
          ? [
              {
                id: uid('con'),
                name: 'Priya Nair',
                role: 'Engineering Manager',
                email: `priya@${seed.company.toLowerCase().replace(/\s+/g, '')}.com`,
                linkedin: '',
                kind: 'referral',
              },
            ]
          : seed.status === 'Interview' || seed.status === 'Offer'
            ? [
                {
                  id: uid('con'),
                  name: 'Dan Whitcombe',
                  role: 'Technical Recruiter',
                  email: `dan@${seed.company.toLowerCase().replace(/\s+/g, '')}.com`,
                  linkedin: '',
                  kind: 'recruiter',
                },
              ]
            : [],
      notes:
        seed.status === 'Interview'
          ? [
              {
                id: uid('note'),
                body: 'System design round booked. They flagged the Postgres partitioning work specifically — lead with that.',
                created_at: daysAgoIso(Math.max(1, lastTransitionDay - 1)),
              },
            ]
          : seed.status === 'Offer'
            ? [
                {
                  id: uid('note'),
                  body: 'Verbal offer at £105k. Asked for a week to decide; comparing against the Nimbus process.',
                  created_at: daysAgoIso(Math.max(1, lastTransitionDay)),
                },
              ]
            : [],
      attachments:
        appliedAt && seed.tailored
          ? [
              {
                id: uid('att'),
                filename: `ayesha-raman-${seed.company.toLowerCase().replace(/\s+/g, '-')}.pdf`,
                kind: 'resume',
                format: 'pdf',
                storage_key: `s3://jobpilot/attachments/${appId}/resume.pdf`,
                snapshot: `Frozen snapshot of the resume submitted to ${seed.company} on ${appliedAt.slice(0, 10)}.`,
                size_bytes: 148_000 + index * 137,
                created_at: appliedAt,
              },
            ]
          : [],
      jd_snapshot: jdText,
      created_at: daysAgoIso(seed.daysAgo + 1),
      updated_at: daysAgoIso(Math.max(0, lastTransitionDay)),
    }
    db.applications.push(app)

    if (appliedAt) {
      history.push({
        id: uid('sh'),
        application_id: appId,
        from_status: 'Saved',
        to_status: 'Applied',
        changed_at: appliedAt,
        note: '',
      })
      let prev: ApplicationStatus = 'Applied'
      for (const step of seed.path) {
        history.push({
          id: uid('sh'),
          application_id: appId,
          from_status: prev,
          to_status: step.status,
          changed_at: daysAgoIso(Math.max(0, seed.daysAgo - step.afterDays)),
          note: '',
        })
        prev = step.status
      }
    } else {
      history.push({
        id: uid('sh'),
        application_id: appId,
        from_status: null,
        to_status: 'Saved',
        changed_at: daysAgoIso(seed.daysAgo),
        note: 'Saved from the discovery feed',
      })
    }
  })
  db.status_history.push(...history)

  /* --------------------------------------------------- saved searches */
  const searchId = uid('ss')
  const search: SavedSearch = {
    id: searchId,
    user_id: userId,
    name: 'Senior backend — UK / remote EU',
    keywords: ['backend engineer', 'python', 'platform engineer'],
    seniority: ['senior', 'staff'],
    locations: ['London', 'Remote (UK)', 'Remote (EU)'],
    remote_only: false,
    salary_floor: 95_000,
    industries_include: ['fintech', 'health', 'developer tools'],
    industries_exclude: ['gambling', 'defence'],
    company_size: ['scaleup', 'midmarket'],
    channels: ['Greenhouse', 'Lever', 'Ashby', 'RemoteOK', 'Adzuna'],
    fit_threshold: 65,
    auto_draft: true,
    digest: 'daily',
    is_active: true,
    last_run_at: daysAgoIso(0.2),
    created_at: daysAgoIso(40),
  }
  const secondSearch: SavedSearch = {
    id: uid('ss'),
    user_id: userId,
    name: 'Staff / lead roles, remote only',
    keywords: ['staff engineer', 'lead engineer'],
    seniority: ['staff', 'lead'],
    locations: [],
    remote_only: true,
    salary_floor: 130_000,
    industries_include: [],
    industries_exclude: ['gambling'],
    company_size: ['scaleup', 'enterprise'],
    channels: ['Greenhouse', 'Lever', 'Ashby'],
    fit_threshold: 75,
    auto_draft: false,
    digest: 'weekly',
    is_active: true,
    last_run_at: daysAgoIso(2),
    created_at: daysAgoIso(18),
  }
  db.saved_searches.push(search, secondSearch)

  /* -------------------------------------------------- discovered jobs */
  DISCOVERED.forEach((row) => {
    const raw = SYNTHETIC_JD(row.company, row.role, row.location, row.salary ?? '')
    const parsed = parseJobDescription(raw, `https://example.com/${row.company.toLowerCase()}`)
    parsed.company_name = row.company
    parsed.role_title = row.role
    parsed.location = row.location
    parsed.remote = row.remote
    parsed.salary_text = row.salary
    const jd: JobDescription = {
      id: uid('jd'),
      user_id: userId,
      source_url: `https://example.com/${row.company.toLowerCase().replace(/\s+/g, '-')}/jobs/1`,
      source: row.channel,
      raw_text: raw,
      parsed,
      company_name: row.company,
      role_title: row.role,
      created_at: daysAgoIso(row.hoursAgo / 24),
    }
    db.job_descriptions.push(jd)

    const report = matchResumeToJD(content, parsed, { resume_id: masterId, job_description_id: jd.id })
    db.discovered_jobs.push({
      id: uid('dj'),
      saved_search_id: searchId,
      job_description_id: jd.id,
      company_name: row.company,
      role_title: row.role,
      location: row.location,
      remote: row.remote,
      salary_text: row.salary,
      channel: row.channel,
      url: jd.source_url!,
      match_score: row.score,
      match_reasons: matchReasons(report, parsed),
      status: row.status,
      draft_resume_id: null,
      draft_cover_letter_id: null,
      application_id: null,
      discovered_at: daysAgoIso(row.hoursAgo / 24),
    })
  })

  /* ---------------------------------------------------------- usage */
  db.usage.generations = [
    ...Array.from({ length: 14 }, (_, i) => ({ kind: 'parse_jd', at: daysAgoIso(i * 2), cached: i % 3 === 0 })),
    ...Array.from({ length: 9 }, (_, i) => ({ kind: 'tailor', at: daysAgoIso(i * 3), cached: false })),
    ...Array.from({ length: 7 }, (_, i) => ({ kind: 'cover_letter', at: daysAgoIso(i * 4), cached: false })),
    ...Array.from({ length: 4 }, (_, i) => ({ kind: 'interview_questions', at: daysAgoIso(i * 5), cached: false })),
  ]

  db.session = null
  return db
}

export function seedIfEmpty(db: DbShape): DbShape {
  if (db.users.length > 0) return db
  return buildSeedDb()
}
