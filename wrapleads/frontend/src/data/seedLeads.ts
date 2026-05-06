import type { Lead } from '../api/types';

export const SEED_LEADS: Partial<Lead>[] = [
  {
    company: 'ABC Fleet Services',
    category: 'fleet',
    state: 'TX',
    city: 'Houston',
    contactName: 'John Smith',
    contactTitle: 'Fleet Manager',
    email: 'john@abcfleet.com',
    phone: '(713) 555-0101',
    website: 'https://abcfleet.com',
    fleetSize: '25',
    pitchAngle: 'Fleet branding for 25+ vehicles',
    status: 'cold',
    notes: '',
  },
];
