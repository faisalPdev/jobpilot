/**
 * Vocabulary used by the local heuristic engine.
 *
 * In production these lists live server-side and the heavy lifting is done by the
 * Claude API (see spec §9 "AI layer"). The client keeps a copy so the mock backend
 * can run the whole product with no network, and so the UI can do instant
 * client-side highlighting without a round trip.
 */

/** Canonical skill -> surface forms that should count as the same thing. */
export const SKILL_SYNONYMS: Record<string, string[]> = {
  python: ['python', 'py3', 'python3'],
  typescript: ['typescript', 'ts'],
  javascript: ['javascript', 'js', 'es6'],
  react: ['react', 'react.js', 'reactjs'],
  'next.js': ['next.js', 'nextjs'],
  node: ['node', 'node.js', 'nodejs'],
  fastapi: ['fastapi'],
  django: ['django'],
  flask: ['flask'],
  postgresql: ['postgresql', 'postgres', 'psql'],
  mysql: ['mysql'],
  mongodb: ['mongodb', 'mongo'],
  redis: ['redis'],
  celery: ['celery'],
  kafka: ['kafka'],
  rabbitmq: ['rabbitmq'],
  docker: ['docker', 'containerisation', 'containerization'],
  kubernetes: ['kubernetes', 'k8s'],
  terraform: ['terraform'],
  aws: ['aws', 'amazon web services'],
  gcp: ['gcp', 'google cloud'],
  azure: ['azure'],
  'ci/cd': ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery'],
  'github actions': ['github actions'],
  graphql: ['graphql'],
  rest: ['rest', 'rest api', 'restful'],
  grpc: ['grpc'],
  microservices: ['microservices', 'micro-services'],
  'system design': ['system design', 'architecture', 'distributed systems'],
  sql: ['sql'],
  pandas: ['pandas'],
  numpy: ['numpy'],
  pytorch: ['pytorch', 'torch'],
  tensorflow: ['tensorflow'],
  'scikit-learn': ['scikit-learn', 'sklearn'],
  llm: ['llm', 'large language model', 'gpt', 'claude', 'openai', 'anthropic'],
  rag: ['rag', 'retrieval augmented generation', 'retrieval-augmented'],
  'prompt engineering': ['prompt engineering', 'prompting'],
  'vector database': ['vector database', 'pgvector', 'pinecone', 'weaviate', 'embeddings'],
  mlops: ['mlops'],
  airflow: ['airflow'],
  dbt: ['dbt'],
  spark: ['spark', 'pyspark'],
  snowflake: ['snowflake'],
  tableau: ['tableau'],
  'power bi': ['power bi', 'powerbi'],
  looker: ['looker'],
  'a/b testing': ['a/b testing', 'ab testing', 'experimentation', 'split testing'],
  analytics: ['analytics', 'product analytics', 'amplitude', 'mixpanel'],
  'product management': ['product management', 'product owner', 'roadmap'],
  agile: ['agile', 'scrum', 'kanban', 'sprint'],
  jira: ['jira'],
  figma: ['figma'],
  'ui/ux': ['ui/ux', 'ux', 'user experience', 'user research'],
  accessibility: ['accessibility', 'a11y', 'wcag'],
  testing: ['testing', 'unit tests', 'pytest', 'jest', 'vitest', 'playwright', 'cypress'],
  observability: ['observability', 'monitoring', 'datadog', 'grafana', 'prometheus', 'sentry'],
  security: ['security', 'owasp', 'penetration testing', 'appsec'],
  'stakeholder management': ['stakeholder management', 'stakeholders', 'cross-functional'],
  mentoring: ['mentoring', 'mentorship', 'coaching', 'onboarding engineers'],
  leadership: ['leadership', 'tech lead', 'team lead', 'led a team'],
  communication: ['communication', 'written communication', 'presentation'],
  salesforce: ['salesforce'],
  hubspot: ['hubspot'],
  seo: ['seo', 'search engine optimisation', 'search engine optimization'],
  'content marketing': ['content marketing', 'content strategy'],
  'financial modelling': ['financial modelling', 'financial modeling', 'valuation'],
  excel: ['excel', 'spreadsheets', 'google sheets'],
}

export const ALL_SKILLS = Object.keys(SKILL_SYNONYMS)

/** Strong action verbs used by the scorer and the bullet rewriter. */
export const ACTION_VERBS = [
  'accelerated', 'architected', 'automated', 'built', 'consolidated', 'cut', 'delivered',
  'designed', 'diagnosed', 'doubled', 'drove', 'eliminated', 'expanded', 'grew', 'implemented',
  'improved', 'increased', 'introduced', 'launched', 'led', 'migrated', 'negotiated',
  'optimised', 'optimized', 'owned', 'partnered', 'pioneered', 'prototyped', 'rearchitected',
  'reduced', 'refactored', 'replaced', 'resolved', 'scaled', 'shipped', 'simplified',
  'standardised', 'standardized', 'streamlined', 'tripled', 'unblocked', 'unified',
]

/** Phrasing the scorer flags and the rewriter replaces. */
export const WEAK_OPENERS = [
  'responsible for',
  'worked on',
  'helped with',
  'helped to',
  'assisted with',
  'involved in',
  'tasked with',
  'participated in',
  'duties included',
  'in charge of',
  'part of a team that',
  'various',
]

export const PASSIVE_MARKERS = [
  ' was ', ' were ', ' been ', ' being ', ' is being ', ' has been ', ' have been ',
]

export const FILLER_WORDS = [
  'synergy', 'go-getter', 'rockstar', 'ninja', 'guru', 'hard-working', 'team player',
  'detail-oriented', 'self-starter', 'think outside the box', 'results-driven',
]

/** Words dropped before keyword extraction. */
export const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being
  below between both but by can cannot could did do does doing down during each few for from
  further had has have having he her here hers herself him himself his how i if in into is it
  its itself me more most my myself no nor not of off on once only or other ought our ours
  ourselves out over own same she should so some such than that the their theirs them themselves
  then there these they this those through to too under until up very was we were what when
  where which while who whom why with would you your yours yourself yourselves will shall may
  might must role team teams work working experience years year strong good great excellent
  ability able looking join company candidate candidates job position opportunity opportunities
  responsibilities requirements required preferred plus bonus nice must have has using use used
  well across within also new our us their like etc e.g i.e per including include includes
  environment fast paced help helping ensure ensuring drive driving support supporting`
    .split(/\s+/)
    .filter(Boolean),
)

export const SENIORITY_PATTERNS: { level: string; patterns: RegExp[] }[] = [
  { level: 'intern', patterns: [/\bintern(ship)?\b/i, /\bgraduate\b/i, /\btrainee\b/i] },
  { level: 'junior', patterns: [/\bjunior\b/i, /\bentry[- ]level\b/i, /\bassociate\b/i, /\bjr\.?\b/i] },
  { level: 'mid', patterns: [/\bmid[- ]level\b/i, /\bmid\b/i, /\bii\b/, /\bintermediate\b/i] },
  { level: 'senior', patterns: [/\bsenior\b/i, /\bsr\.?\b/i, /\biii\b/] },
  { level: 'staff', patterns: [/\bstaff\b/i, /\bprincipal\b/i] },
  { level: 'lead', patterns: [/\blead\b/i, /\bteam lead\b/i, /\bem\b/, /\bengineering manager\b/i] },
  { level: 'director', patterns: [/\bdirector\b/i, /\bhead of\b/i, /\bvp\b/i, /\bchief\b/i] },
]

/** Section headers a parser (and an ATS) expects to find. */
export const SECTION_HEADERS: Record<string, RegExp> = {
  summary: /^(professional\s+)?(summary|profile|objective|about( me)?)\s*:?\s*$/i,
  experience: /^(work\s+|professional\s+|employment\s+|relevant\s+)?(experience|history)\s*:?\s*$/i,
  education: /^education(\s+&?\s*training)?\s*:?\s*$/i,
  skills: /^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tech stack)\s*:?\s*$/i,
  projects: /^(side\s+|personal\s+|selected\s+)?projects\s*:?\s*$/i,
  certifications: /^(certifications?|licenses?|courses)\s*:?\s*$/i,
  languages: /^languages?\s*:?\s*$/i,
}
