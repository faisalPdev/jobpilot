/** Realistic raw postings used to seed the demo database and the "load a sample" buttons. */
export interface JdSample {
  key: string
  label: string
  url: string
  channel: 'Greenhouse' | 'Lever' | 'Ashby' | 'RemoteOK' | 'Company site' | 'Adzuna'
  text: string
}

export const JD_SAMPLES: JdSample[] = [
  {
    key: 'nimbus-senior-backend',
    label: 'Nimbus Labs — Senior Backend Engineer',
    url: 'https://boards.greenhouse.io/nimbuslabs/jobs/4820113',
    channel: 'Greenhouse',
    text: `Senior Backend Engineer
Nimbus Labs · Remote (UK / EU) · Engineering

About Nimbus Labs
Nimbus Labs builds the data infrastructure behind a few thousand climate-risk models. We are 60 people, Series B, and profitable on a per-customer basis.

What you'll do
- Own the ingestion platform end to end: FastAPI services, Celery workers, and the Postgres schemas underneath them
- Design and ship REST APIs consumed by our own frontend and by three enterprise partners
- Cut the cost of our nightly pipeline, which currently runs on Airflow and Spark
- Partner with data science to move models from notebooks into production services
- Mentor two mid-level engineers and raise the bar on code review

What you'll need
- 5+ years building backend services in Python, ideally with FastAPI or Django
- Strong PostgreSQL: you can read a query plan and know when to reach for an index vs a rewrite
- Production experience with Docker and Kubernetes
- Solid grasp of system design and distributed systems failure modes
- Experience with CI/CD and a genuine habit of testing (we use pytest)

Nice to have
- Redis and Celery at scale
- Terraform, or another infrastructure-as-code tool
- Observability tooling — we run Datadog and Grafana
- Exposure to Kafka
- Prior work with LLM APIs; we are adding a retrieval layer this year

Compensation: £95,000 - £125,000 per year plus equity.
We are an equal opportunity employer.`,
  },
  {
    key: 'harborstack-fullstack',
    label: 'HarborStack — Full-Stack Engineer (React/Python)',
    url: 'https://jobs.lever.co/harborstack/9f2c1a44',
    channel: 'Lever',
    text: `Full-Stack Engineer (React / Python)
HarborStack · Bengaluru, India (Hybrid, 2 days in office)

The role
You will be the fourth engineer on our product team, working across a React + TypeScript frontend and a FastAPI backend. We ship to production several times a day.

Responsibilities
- Build product features end to end, from Postgres schema to React component
- Improve the performance of our dashboard, which currently renders large tables slowly
- Own the design system work in Figma alongside our designer
- Write tests — Vitest and Playwright — for everything that touches money
- Take part in on-call, one week in five

Requirements
- 3+ years of professional experience with React and TypeScript
- Proficient in Python; FastAPI or Flask experience required
- SQL fluency and comfort modelling data in PostgreSQL
- Familiarity with Docker and GitHub Actions
- Strong written communication — we are async-first across two time zones

Bonus points
- Experience with Redis caching
- Accessibility work (WCAG)
- Product analytics tooling such as Amplitude or Mixpanel
- A/B testing and experimentation

₹28,00,000 - ₹38,00,000 per annum.`,
  },
  {
    key: 'quantile-ml',
    label: 'Quantile AI — Machine Learning Engineer, LLM Platform',
    url: 'https://jobs.ashbyhq.com/quantile-ai/ml-platform',
    channel: 'Ashby',
    text: `Machine Learning Engineer — LLM Platform
Quantile AI · Remote (Global) · Applied AI

About the job
We run the retrieval and evaluation layer that sits between our customers' documents and the models. You will be the third engineer on the platform team.

Day to day you will
- Design and operate a RAG pipeline over roughly 40M documents
- Own our vector database layer (pgvector today, evaluating alternatives)
- Build the evaluation harness that gates every prompt change
- Drive down inference cost through caching, batching and prompt engineering
- Work directly with customers on failure cases

Minimum qualifications
- 4+ years in software engineering, at least 2 of them shipping ML systems
- Expert Python; strong PyTorch or TensorFlow
- Demonstrated experience with LLM APIs and prompt engineering
- Experience with vector databases and embeddings
- Comfortable with Docker, Kubernetes and cloud infrastructure on AWS

Preferred
- MLOps tooling and model monitoring
- Familiarity with Kafka or another streaming system
- Snowflake or dbt experience
- Published work or open-source contributions

$180,000 - $230,000 plus equity. Fully remote.`,
  },
  {
    key: 'meridian-pm',
    label: 'Meridian Health — Senior Product Manager, Platform',
    url: 'https://meridianhealth.com/careers/senior-product-manager-platform',
    channel: 'Company site',
    text: `Senior Product Manager, Platform
Meridian Health · London, UK · Product

Who we are
Meridian Health builds the scheduling and records platform used by 1,200 clinics across the UK.

What you will own
- The platform roadmap: APIs, integrations and the internal tooling other product teams build on
- Prioritisation across four engineering teams, with a clear no-list
- Stakeholder management across clinical operations, compliance and sales
- Discovery: user research with clinicians, then turning it into shipped product
- The metrics: you will define them, instrument them, and report on them monthly

Requirements
- 5+ years in product management, at least 2 on a platform or API product
- Demonstrated ability to run discovery and user research
- Strong analytics: SQL fluency is required, and you should be comfortable in Looker or Tableau
- Experience with agile delivery and working closely with engineering
- Excellent written communication and stakeholder management

Nice to have
- Healthcare, regulated or clinical software background
- Experience with A/B testing and experimentation frameworks
- Familiarity with Jira and roadmap tooling
- Design partnership experience in Figma

£85,000 - £105,000 plus benefits.`,
  },
  {
    key: 'orbitworks-frontend',
    label: 'Orbitworks — Frontend Engineer, Design Systems',
    url: 'https://remoteok.com/remote-jobs/orbitworks-frontend-engineer',
    channel: 'RemoteOK',
    text: `Frontend Engineer — Design Systems
Orbitworks · Remote (Americas) · Engineering

The team
Design Systems is three engineers and one designer. We own the component library used by every product surface at Orbitworks.

You will
- Build and maintain accessible React components in TypeScript
- Own the accessibility standard — WCAG 2.2 AA — and the audits that keep us there
- Improve build and bundle performance across six consuming applications
- Write the documentation and migration guides teams actually read
- Partner with designers in Figma to close the design/code gap

We are looking for
- 4+ years of frontend engineering with React and TypeScript
- Deep CSS knowledge and strong opinions about component API design
- Testing discipline: Jest or Vitest, plus Playwright for interaction tests
- Experience with accessibility and assistive technology
- Familiarity with monorepo tooling and CI/CD

Nice to have
- Experience publishing a public component library
- GraphQL
- Next.js
- Node tooling and codemods

$150,000 - $185,000 USD, fully remote within the Americas.`,
  },
  {
    key: 'lumen-data-analyst',
    label: 'Lumen Retail — Senior Data Analyst',
    url: 'https://boards.greenhouse.io/lumenretail/jobs/771204',
    channel: 'Greenhouse',
    text: `Senior Data Analyst
Lumen Retail · Berlin, Germany (Hybrid) · Data

About the role
You will be the analytics partner to our merchandising organisation, owning the numbers that decide what we buy and how we price it.

Responsibilities
- Build and maintain dbt models on top of Snowflake
- Own the merchandising dashboards in Looker
- Design experiments and analyse results — pricing tests run weekly
- Partner with finance on forecast accuracy
- Mentor two junior analysts

Requirements
- 4+ years in analytics with expert SQL
- Strong Python for analysis: pandas and numpy
- Experience with dbt and a cloud warehouse (we use Snowflake)
- Proven experience with A/B testing and statistical inference
- Excellent communication with non-technical stakeholders

Nice to have
- Looker or Tableau administration
- Airflow
- Retail or e-commerce domain experience
- German language skills (not required, we work in English)

€75,000 - €95,000 per year.`,
  },
]

export function sampleByKey(key: string) {
  return JD_SAMPLES.find((s) => s.key === key)
}
