/**
 * Owl agent type definitions
 */

export type OwlId = 'poly' | 'nova' | 'atlas' | 'ember' | 'ledger' | 'scout';

export interface OwlInfo {
    id: OwlId;
    name: string;
    species: string;
    role: string;
    color: string;  // CSS color for header/accents
}

/**
 * Owl metadata for the frontend — uses Meaningful AI brand palette
 */
export const OWL_INFO: Record<OwlId, OwlInfo> = {
    poly: { id: 'poly', name: 'Poly', species: 'Great Horned Owl', role: 'Host & Facilitator', color: '#4A66AC' },       // True Blue
    nova: { id: 'nova', name: 'Nova', species: 'Snowy Owl', role: 'AI Strategist', color: '#222D63' },                   // Delft Blue
    atlas: { id: 'atlas', name: 'Atlas', species: 'Barn Owl', role: 'Data Scientist & Architect', color: '#4A66AC' },    // True Blue
    ember: { id: 'ember', name: 'Ember', species: 'Eastern Screech Owl', role: 'Change & Enablement', color: '#E83151' },// Red Crayola
    ledger: { id: 'ledger', name: 'Ledger', species: 'Burrowing Owl', role: 'Value Analyst', color: '#222D63' },         // Delft Blue
    scout: { id: 'scout', name: 'Scout', species: 'Elf Owl', role: 'Industry Research', color: '#60CBE8' },              // Sky Blue
};
