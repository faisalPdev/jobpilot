import type { Bullet, ResumeContent, SectionKey } from '@/types'
import { uid } from './utils'

export const SECTION_LABELS: Record<SectionKey, string> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
}

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'summary',
  'experience',
  'projects',
  'skills',
  'education',
  'certifications',
  'languages',
]

export function bullet(html: string, order_index: number): Bullet {
  return { id: uid('b'), html, order_index }
}

export function emptyResumeContent(): ResumeContent {
  return {
    contact: {
      full_name: '',
      headline: '',
      email: '',
      phone: '',
      location: '',
      links: [],
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    section_order: [...DEFAULT_SECTION_ORDER],
    hidden_sections: [],
  }
}

export function newExperience(order_index: number) {
  return {
    id: uid('exp'),
    company: '',
    title: '',
    location: '',
    start_date: '',
    end_date: null,
    is_current: false,
    bullets: [bullet('', 0)],
    order_index,
  }
}

export function newEducation(order_index: number) {
  return {
    id: uid('edu'),
    school: '',
    degree: '',
    field: '',
    start_date: '',
    end_date: '',
    grade: '',
    order_index,
  }
}

export function newSkillGroup(order_index: number) {
  return { id: uid('sk'), category: 'New group', skills: [], order_index }
}

export function newProject(order_index: number) {
  return {
    id: uid('proj'),
    name: '',
    role: '',
    url: '',
    description: '',
    bullets: [bullet('', 0)],
    order_index,
  }
}

export function newCertification(order_index: number) {
  return { id: uid('cert'), name: '', issuer: '', issued_on: '', order_index }
}

export function newLanguage(order_index: number) {
  return {
    id: uid('lang'),
    language: '',
    proficiency: 'Professional' as const,
    order_index,
  }
}
