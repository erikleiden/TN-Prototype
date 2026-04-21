/**
 * Tennessee Stranded Talent Interactive Explorer
 * ================================================
 * A policy dashboard for analyzing workforce stratification in Tennessee.
 * Identifies "stranded workers" (low-wage, underemployed, career-stalled)
 * and provides career pathway analysis with skill gap and credential data.
 *
 * Data sources:
 *   - cross_tabulated_data.json: Worker microdata by occupation/industry/demographics
 *   - stalled_workers.csv: Tenure-based stalled worker analysis
 *   - occ_similarity.json: O*NET skill-similarity between occupation pairs
 *   - national_transitions.json: Observed occupational transitions (national + TN)
 *   - skill_gaps_top5.json: Skill gaps for top-5 destination occupations
 *   - cross_pathway_skills.json: Pre-computed skill subcategory gaps aggregated across destination occupations
 *   - posting_demand.json: TN job posting demand by occupation and sector
 *   - tn_licenses.json: Statutory occupational licensing (Knee Center data)
 *   - common_credentials.json: Common industry-expected certifications
 *
 * Architecture:
 *   index.tsx (this file) — main App component, state management, data orchestration
 *   src/components/TennesseeMap.tsx — interactive D3 map of TN MSA regions
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MapPin, Briefcase, Target, Download, Users, GraduationCap,
  ArrowRight, ChevronDown, LayoutDashboard, BarChart3, Layers,
  FileText, TrendingUp, Map as MapIcon, Flame, Activity
} from 'lucide-react';
import TennesseeMap from './src/components/TennesseeMap';

// --- Static data imports (bundled at build time by Vite) ---
import crossTabulatedRaw from './src/data/cross_tabulated_data.json';
import stallDurationRaw from './src/data/stall_duration.json';
import occSimilarityRaw from './src/data/occ_similarity.json';
import nationalTransitionsRaw from './src/data/national_transitions.json';
import skillGapsTop5Raw from './src/data/skill_gaps_top5.json';
import crossPathwaySkillsRaw from './src/data/cross_pathway_skills.json';
import postingDemandRaw from './src/data/posting_demand.json';
import tnLicensesRaw from './src/data/tn_licenses.json';
import commonCredsRaw from './src/data/common_credentials.json';

// ============================================================================
// TYPES
// ============================================================================

type MSACategory = 'Nashville' | 'Memphis' | 'Knoxville' | 'Chattanooga' | 'Other MSA' | 'All';
type CohortType = 'Low Wage' | 'Underemployed' | 'Stalled' | 'All Stranded';

/** A row from cross_tabulated_data.json (SOC x NAICS2 x MSA crosstab) */
interface DataRow {
  SOC_2019_5_ACS: string;
  SOC_2019_5_ACS_NAME: string;
  naics2: string;
  naics2_title: string;
  msa_category: string;
  estimated_stalled_only: number;
  oews_calibrated_employment: number;
  estimated_stalled: number;
  estimated_low_wage: number;
  estimated_underemployed: number;
  estimated_stalled_low_wage: number;
  estimated_stalled_underempl: number;
  estimated_stalled_both: number;
  n_pdl_current: number;
}

/** A row from stall_duration.json (NAICS2 x MSA tenure histogram) */
interface StallDurationRow {
  naics2: string;
  naics2_title: string;
  msa_category: string;
  estimated_stalled_only: number;
  'stall_tenure_3-4': number;
  'stall_tenure_4-5': number;
  'stall_tenure_5-7': number;
  'stall_tenure_7-10': number;
}

/** A row from occ_similarity.json or national_transitions.json */
interface PathwayRow {
  SOC_2019_5_ACS_NAME_SOURCE: string;
  SOC_2019_5_ACS_NAME_TARGET: string;
  standardized_similarity: number;
  similarity_rating: string;
  a_median_SOURCE: number;
  a_median_TARGET: number;
  share_stranded_SOURCE: number;
  share_stranded_TARGET: number;
  share_low_wage_SOURCE: number;
  share_low_wage_TARGET: number;
  share_underemployed_SOURCE: number;
  share_underemployed_TARGET: number;
  share_part_time_SOURCE: number;
  share_part_time_TARGET: number;
  potential_wage_gain: number;
  potential_wage_gain_pct: number;
  diff_strandedness: number;
  demand_category_TARGET: string | null;
  demand_growth_category_TARGET: string | null;
  // Transition-only fields (null on similarity rows)
  at_year_5_national?: number | null;
  at_year_5_tennessee?: number | null;
  origin_share_at_year_5?: number | null;
}

/** A row from skill_gaps_top5.json */
interface SkillGapRow {
  origin_occupation: string;
  destination_occupation: string;
  SKILL_NAME: string;
  skill_gap: number;
  destination_importance: number;
}

/** A row from cross_pathway_skills.json */
interface CrossPathwaySkillRow {
  origin_occupation: string;
  SKILL_SUBCATEGORY_NAME: string;
  n_destination_occs: number;
  avg_skill_gap: number;
  total_destination_occs: number;
}

/** A row from posting_demand.json (occ-level demand) */
interface OccDemandRow {
  SOC_2019_5_ACS_NAME: string;
  n_postings_tn: number | null;
  tn_share: number | null;
  lq: number | null;
  demand_category: string;
}

/** A row from posting_demand.json (occupation x sector demand) */
interface OccSectorDemandRow {
  SOC_2019_5_ACS_NAME: string;
  NAICS2_NAME: string;
  n_postings_tn: number | null;
  demand_category: string | null;
}

/** A row from posting_demand.json (growth trends) */
interface ShareGrowthRow {
  SOC_2019_5_ACS_NAME: string;
  postings_share_implied_annual_growth_pct: number | null;
  share_growth_trend: string;
}

interface LicenseEntry {
  profession: string;
  regulation: string;
  degree: string;
}

interface CredentialEntry {
  credential: string;
  type: 'common_expectation';
  description: string;
}

// ============================================================================
// DATA SETUP
// ============================================================================

const crossTabulatedData = crossTabulatedRaw as DataRow[];
const stallDuration = stallDurationRaw as StallDurationRow[];
const occSimilarity = occSimilarityRaw as PathwayRow[];
const nationalTransitions = nationalTransitionsRaw as PathwayRow[];
const skillGapsTop5 = skillGapsTop5Raw as SkillGapRow[];
const crossPathwaySkillsData = crossPathwaySkillsRaw as CrossPathwaySkillRow[];
const postingDemand = postingDemandRaw as {
  occ: OccDemandRow[];
  occ_sector: OccSectorDemandRow[];
  share_growth: ShareGrowthRow[];
};
const tnLicenses = tnLicensesRaw as Record<string, LicenseEntry[]>;
const commonCredentials = commonCredsRaw as Record<string, CredentialEntry[]>;

// Build lookup maps for fast access
const demandByOcc = new Map(postingDemand.occ.map(r => [r.SOC_2019_5_ACS_NAME, r]));
const growthByOcc = new Map(postingDemand.share_growth.map(r => [r.SOC_2019_5_ACS_NAME, r]));
const demandByOccSector = new Map<string, OccSectorDemandRow>();
postingDemand.occ_sector.forEach(r => {
  demandByOccSector.set(`${r.SOC_2019_5_ACS_NAME}|||${r.NAICS2_NAME}`, r);
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Stall-duration brackets (matching pre-binned columns in stall_duration.json) */
const TENURE_LABELS = ['3-4 yrs', '4-5 yrs', '5-7 yrs', '7-10 yrs'] as const;
const TENURE_KEYS: (keyof StallDurationRow)[] = ['stall_tenure_3-4', 'stall_tenure_4-5', 'stall_tenure_5-7', 'stall_tenure_7-10'];

/** Regex patterns for matching credential-like skills from job postings */
const CREDENTIAL_PATTERNS = [
  /\bcertif/i, /\blicens/i, /\bdegree\b/i, /\baccredit/i,
  /\bCDL\b/, /\bOSHA\b/, /\bCPA\b/, /\bCNA\b/, /\bRN\b/, /\bLPN\b/, /\bLVN\b/,
  /\bAPRN\b/, /\bPA-C\b/, /\bLCSW\b/, /\bLMFT\b/, /\bLMHC\b/, /\bLPC\b/,
  /\bCRNA\b/, /\bCRT\b/, /\bCST\b/, /\bCPC\b/, /\bCCS\b/, /\bCMA\b/,
  /\bBCBA\b/, /\bNBCOT\b/, /\bNCCER\b/, /\bASE\b/, /\bGIAC\b/, /\bLEED\b/,
  /\bServSafe\b/, /\bJourneyman\b/, /\bPeace Officer\b/, /\bTeaching Certificate\b/,
  /\bBoard Certified\b/i, /\bBoard Eligible\b/i,
  /\bDriver's License\b/i, /\bA&P\b.*Certificate/i,
  /\bPMP\b/, /\bSix Sigma\b/i, /\bCompTIA\b/i, /\bCISSP\b/, /\bAWS\b/,
  /\bPhlebotomy\b/i, /\bBLS\b/, /\bCPR\b/, /\bACLS\b/,
  /\bSeries [0-9]/i, /\bEPA\b.*608/i, /\bHAZMAT\b/i,
];

/**
 * Domain-based relevance filter for credential→occupation matching.
 * Maps credential keywords to occupation domains they are relevant to,
 * so that (e.g.) "Adobe Certified Professional" never shows for Sheet Metal Workers.
 */
type CredDomain = 'healthcare' | 'behavioral' | 'trades' | 'tech' | 'finance' | 'food' | 'law_enforcement' | 'education' | 'fitness' | 'aviation' | 'safety' | 'general';

const CRED_TO_DOMAIN: [RegExp, CredDomain][] = [
  // Healthcare / clinical
  [/\bRN\b|Registered Nurse|Nurs(?:e|ing)|LPN\b|LVN\b|APRN\b|PA-C\b|Physician|CNA\b|Certified Nursing/i, 'healthcare'],
  [/\bBLS\b|Basic Life Support|ACLS\b|Advanced Cardiovascular|CPR\b|Cardiopulmonary|AED\b|Heartsaver|NRP\b|Neonatal Resuscitation/i, 'healthcare'],
  [/Phlebotomy|ASCP\b|AMT\b|Radiolog|ARRT\b|Sonograph|Sterile Processing|Hemodialysis|EKG|ECG/i, 'healthcare'],
  [/\bCST\b|Surgical|Medical (?:Assist|Billing|Coding|Licens)|Pharmacy|CCC-SLP|Speech.Language/i, 'healthcare'],
  [/Board Certified|Board Eligible|NBCOT\b|Occupational Therapy|Physical Therap|Respiratory|CRNA\b|CRT\b/i, 'healthcare'],
  [/Dietar|Nutrition|Diabetes Educator|Prosthetist|Orthotist|Massage.*Bodywork|Music Therapist|Therapeu?tic Recreation/i, 'healthcare'],
  [/Immunization|Vaccination|Drug Enforcement|DEA\b|Patient Care|NHA Certified|First Responder|CFR\b/i, 'healthcare'],
  [/Nurse (?:Midwife|Practitioner|Anesthetist)|CNM\b|Certified (?:Nurse|Clinical)|Long Term Monitor/i, 'healthcare'],
  [/Veterinar/i, 'healthcare'],
  // Behavioral health / social work / counseling
  [/LCSW\b|LMFT\b|LMHC\b|LPC\b|BCBA\b|BCaBA\b|Social Work|Counselor|CADC\b|Chemical Dependency/i, 'behavioral'],
  [/Behavior Analyst|Psychiatric|Psychology License|MOAB\b|Aggressive Behavior|Crisis Prevention|CPI\b/i, 'behavioral'],
  [/Case Manager|CCM\b|Community Health Worker|Employment Support|School Social Work/i, 'behavioral'],
  // Construction / trades / transportation
  [/\bCDL\b|Commercial Driver|Chauffeur|Air Brake|Tanker|Doubles.*Triples|TWIC\b|DOT Medical/i, 'trades'],
  [/\bOSHA\b|NCCER\b|Journeyman|Forklift|Crane Operator|Concrete.*ACI|Rigging|Scaffold/i, 'trades'],
  [/\bASE\b|Automotive Service|I-CAR\b|EPA.*608|Refrigerant|HVAC\b|NATE\b|R-410A/i, 'trades'],
  [/Electrician|Plumber|Pipefitter|Lineman|Powerline|NFPA\b|Arc Flash/i, 'trades'],
  [/Lead.Safe|Hazardous Material|HAZMAT\b|HAZWOPER\b|Pesticide|Welding|AWS Certified Weld/i, 'trades'],
  [/Valid Driver's License/i, 'general'],
  // IT / Tech
  [/CompTIA\b|CISSP\b|GIAC\b|Cisco|Microsoft Certified|Oracle.*Cloud|Linux Certified/i, 'tech'],
  [/Information Systems Security|Cyber|Network\+|Security\+|Salesforce|Google Cloud|Red Hat/i, 'tech'],
  // Finance
  [/\bCPA\b|Certified Public Account|CFA\b|Series [0-9]|FINRA\b|Financial Planner/i, 'finance'],
  [/Actuar|Insurance License|Adjuster License|Real Estate.*License|Property Specialist/i, 'finance'],
  [/Benefits Professional|Payroll|Bookkeep/i, 'finance'],
  // Food service
  [/ServSafe\b|Food (?:Safety|Handler)|TIPS\b.*Certification|Alcohol Certification/i, 'food'],
  // Law enforcement
  [/Peace Officer|POST\b.*Certificate|Corrections Officer|Wicklander/i, 'law_enforcement'],
  // Education
  [/Teaching Certificate|Catechist|Career Development Facilitator/i, 'education'],
  // Fitness / recreation
  [/AFAA\b|Personal Trainer|Group Fitness|PSIA.*AASI|Clinical Exercise Specialist/i, 'fitness'],
  // Aviation
  [/Airframe.*Powerplant|A&P\b.*Certificate/i, 'trades'],
  // Safety (cross-domain)
  [/Certified Safety Professional|Loss (?:Prevention|Control)/i, 'safety'],
  // Project management (broadly applicable)
  [/\bPMP\b|Project Management Professional|Six Sigma|Lean Six/i, 'general'],
  [/LEED\b/i, 'trades'],
  // Catch-all for generic cert/license matches
  [/\baccredit/i, 'general'],
  [/\bdegree\b/i, 'general'],
  [/Birth Certificate/i, 'general'],
  [/COVID.*Vaccin/i, 'general'],
  [/First Aid|Red Cross/i, 'general'],
  [/\bCPC\b|Certified Professional Coder|Medical Coding/i, 'healthcare'],
  [/\bCCS\b|Certified Coding Specialist/i, 'healthcare'],
  [/\bCMA\b/i, 'healthcare'],
  [/Alliance.*Information.*Referral/i, 'behavioral'],
  [/Activity Assistant/i, 'healthcare'],
  [/Architecture License/i, 'trades'],
  [/Professional Engineer|PE License/i, 'trades'],
];

const OCC_DOMAINS: [RegExp, CredDomain[]][] = [
  // Healthcare occupations (broad match for medical/clinical roles)
  [/Nurs|Physician|Surgeon|Dental|Pharm|Radiolog|Medical|Health(?!.*Safety)|Clinical|Respiratory|Diagnost|Sonograph|Patholog|Dietitian|Nutritionist|Optom|Chiropract|Veterinar|Podiatr|Speech.Language|Audiolog|Occupational Therap|Physical Therap|Massage|Ambulance|EMT\b|Paramedic|Psychiatric Aide|Orderly|Home Health|Phlebotom|Surgical Tech|Anesthetist|Midwi|Laboratory Tech|Other Therapist/i, ['healthcare', 'general']],
  // Behavioral health
  [/Social Work|Counselor|Psycholog|Mental Health|Substance Abuse|Behavioral|Community Health|Rehabilitation/i, ['behavioral', 'healthcare', 'general']],
  // Trades / construction / transportation
  [/Construct|Carpenter|Electrician|Plumber|Mason\b|Roofer|Welder|Weld|HVAC|Heating.*Air|Mechanic|Driver|Truck|Bus Driver|Heavy.*Equipment|Crane|Excavat|Pipeline|Insulation|Sheet Metal|Ironwork|Drywall|Painter.*Paper|Tile|Cement|Paving|Highway Maint|Hazardous Material|Installation.*Maint|Extraction|Automotive|Diesel|Aircraft Mechanic|Power.Line|Maintenance.*Repair|Machin|CNC|Tool.*Die|Assembler|Fabricat|Water.*Wastewater/i, ['trades', 'safety', 'general']],
  // Aviation (must come before generic patterns that might match "Aircraft")
  [/Pilot|Aircraft|Aviation|Aerospace|Flight Engineer|Air Traffic/i, ['aviation', 'trades', 'general']],
  // IT / Tech
  [/Software|Computer|Web Develop|Network.*Architect|Network.*Admin|Database|Information Security|IT |Systems Admin|Programmer|Data Scien|Cyber/i, ['tech', 'general']],
  // Finance
  [/Account|Auditor|Financial|Actuar|Tax|Budget|Credit|Loan|Securities|Broker|Insurance(?!.*Sales)|Claims|Bookkeep|Payroll/i, ['finance', 'general']],
  // Food service
  [/Cook|Chef|Food Prep|Baker|Bartender|Waiter|Waitress|Restaurant|Food Service|Dining|Cafeteria|Food Processing|Supervisors of Food/i, ['food', 'general']],
  // Law enforcement (includes healthcare for CPR/first aid relevance)
  [/Police|Sheriff|Detective|Correction|Probation|Patrol|Criminal|Telecommunicator|Security Guard/i, ['law_enforcement', 'healthcare', 'general']],
  // Fitness / athletics (MUST come before education to avoid "Instructor" false match)
  [/Fitness|Athletic|Exercise|Recreation|Personal Train|\bSport\b|Coach/i, ['fitness', 'healthcare', 'education', 'general']],
  // Education
  [/Teacher|Professor|Instructor|Tutor|Education|School|Librar|Postsecondary|Teaching Assistant|Religious.*Education|Childcare|Preschool|Kindergarten/i, ['education', 'healthcare', 'general']],
  // Project management / business
  [/Project Management|Management Analyst|Business Operation|Logistician|Compliance|Human Resource|Training.*Development|Compensation.*Benefit|Cost Estimat/i, ['general', 'finance']],
  // Engineers (PE license, trades-adjacent)
  [/Engineer/i, ['trades', 'general']],
  // Safety
  [/Safety Specialist|Safety Technician|Occupational Health/i, ['safety', 'trades', 'general']],
  // Insurance sales
  [/Insurance Sales|Real Estate/i, ['finance', 'general']],
  // Landscaping
  [/Landscap|Groundskeep|Lawn Service|Pest Control/i, ['trades', 'general']],
  // Production / manufacturing supervisors
  [/Supervisors of Production|Industrial Truck|Freight.*Stock|Material Mov|Supervisors of Transportation/i, ['trades', 'safety', 'general']],
  // Inspectors
  [/Inspector|Tester|Sorter|Sampler|Weigher|Building Inspector/i, ['trades', 'general']],
  // Firefighters (need trades for hazmat, healthcare for medical response)
  [/Firefighter/i, ['law_enforcement', 'healthcare', 'trades', 'safety', 'general']],
  // Misc
  [/Graphic Design|Producer|Director/i, ['tech', 'general']],
  [/Paralegal|Legal Assist/i, ['finance', 'general']],
  [/Dispatch/i, ['trades', 'general']],
  [/Postal Service/i, ['general']],
  [/Parts Sales/i, ['trades', 'general']],
  [/Painting Worker/i, ['trades', 'general']],
  [/Precision Instrument/i, ['trades', 'healthcare', 'general']],
  [/Architect/i, ['trades', 'general']],
  [/Other life scientist/i, ['healthcare', 'general']],
  [/Other Healthcare/i, ['healthcare', 'general']],
  [/Miscellaneous Health/i, ['healthcare', 'general']],
];

/** Check if a credential skill name is relevant to a destination occupation */
function isCredentialRelevantToOccupation(skillName: string, destOccupation: string): boolean {
  // Determine the credential's domain
  let credDomain: CredDomain = 'general';
  for (const [pat, domain] of CRED_TO_DOMAIN) {
    if (pat.test(skillName)) {
      credDomain = domain;
      break;
    }
  }
  // General credentials (PMP, First Aid, driver's license, etc.) are relevant everywhere
  if (credDomain === 'general') return true;

  // Determine valid domains for the destination occupation
  let occDomains: CredDomain[] = ['general'];
  for (const [pat, domains] of OCC_DOMAINS) {
    if (pat.test(destOccupation)) {
      occDomains = domains;
      break;
    }
  }

  return occDomains.includes(credDomain);
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const pluralize = (name: string): string =>
  name.endsWith('s') ? name : name + 's';

/** Horizontal progress bar for demographic/occupational breakdowns */
const ProgressBar: React.FC<{ label: string; value: number; max: number; colorClass: string }> = ({ label, value, max, colorClass }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight text-slate-500">
      <span className="truncate pr-2">{label}</span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
    </div>
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full transition-all duration-1000 ${colorClass}`}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  </div>
);

/** Demand badge component for pathway cards */
const DemandBadge: React.FC<{ occupation: string; sector?: string; compact?: boolean; isSelected?: boolean }> = ({ occupation, sector, compact, isSelected }) => {
  const occDemand = demandByOcc.get(occupation);
  const growth = growthByOcc.get(occupation);
  // Try sector-specific demand if available
  const sectorDemand = sector ? demandByOccSector.get(`${occupation}|||${sector}`) : null;
  const category = sectorDemand?.demand_category || occDemand?.demand_category || 'N/A';
  const trend = growth?.share_growth_trend || null;

  // Data uses full strings like "High Demand", "Medium Demand", "Low Demand", "Not Enough Data"
  const colorMap: Record<string, string> = {
    'High Demand': isSelected ? 'bg-emerald-400/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
    'Medium Demand': isSelected ? 'bg-amber-400/20 text-amber-300' : 'bg-amber-100 text-amber-700',
    'Low Demand': isSelected ? 'bg-red-400/20 text-red-300' : 'bg-red-100 text-red-700',
    'Not Enough Data': isSelected ? 'bg-white/10 text-blue-300' : 'bg-slate-100 text-slate-400',
  };
  const colors = colorMap[category] || (isSelected ? 'bg-white/10 text-blue-300' : 'bg-slate-100 text-slate-500');

  const trendArrow = trend?.includes('Growing') ? ' ↑' : trend?.includes('Declining') ? ' ↓' : trend?.includes('Stable') ? ' →' : '';
  // Short label: strip " Demand" suffix for compactness
  const shortLabel = category.replace(' Demand', '') + trendArrow;

  if (compact) {
    return (
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${colors}`}>
        {shortLabel}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors}`}>
        {shortLabel}
      </span>
    </div>
  );
};


// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const App = () => {
  // --- State ---
  const [geography, setGeography] = useState<MSACategory>('All');
  const [sector, setSector] = useState<string>('Manufacturing');
  const [selectedCohort, setSelectedCohort] = useState<CohortType>('All Stranded');
  const [targetOccupation, setTargetOccupation] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(0);
  const [pathwayMode, setPathwayMode] = useState<'transitions' | 'similarity'>('transitions');
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);

  // ============================================================================
  // DERIVED DATA (useMemo hooks)
  // ============================================================================

  /** Available NAICS sectors from the cross-tabulated data */
  const sectors = useMemo(() => {
    const allSectors = Array.from(new Set(
      crossTabulatedData.map(d => d.naics2_title).filter(s => s && s !== 'Other' && s !== 'NA')
    ));
    return allSectors.sort();
  }, []);

  /** Workers filtered by selected geography and sector */
  const filteredByScope = useMemo(() =>
    crossTabulatedData.filter(d =>
      (geography === 'All' || d.msa_category === geography) && d.naics2_title === sector
    ),
  [geography, sector]);

  /** Stall duration data filtered by geography and sector */
  const durationByScope = useMemo(() =>
    stallDuration.filter(d =>
      (geography === 'All' || d.msa_category === geography) && d.naics2_title === sector
    ),
  [geography, sector]);

  /** Aggregate stats: total employment, low-wage, underemployed, stalled worker counts */
  const stats = useMemo(() => {
    let total = 0, lw = 0, ue = 0, st = 0;
    filteredByScope.forEach(d => {
      total += d.oews_calibrated_employment;
      lw += d.estimated_low_wage;
      ue += d.estimated_underemployed;
      st += d.estimated_stalled_only;
    });
    return { total: Math.round(total), lw: Math.round(lw), ue: Math.round(ue), st: Math.round(st) };
  }, [filteredByScope]);

  /** Occupational breakdowns for the selected cohort */
  const cohortBreakdowns = useMemo(() => {
    const occ: Record<string, number> = {};

    filteredByScope.forEach(d => {
      let weight = 0;
      if (selectedCohort === 'Low Wage') weight = d.estimated_low_wage;
      else if (selectedCohort === 'Underemployed') weight = d.estimated_underemployed;
      else if (selectedCohort === 'Stalled') weight = d.estimated_stalled_only;
      else weight = d.estimated_low_wage + d.estimated_underemployed + d.estimated_stalled_only;
      occ[d.SOC_2019_5_ACS_NAME] = (occ[d.SOC_2019_5_ACS_NAME] || 0) + weight;
    });

    return {
      occ: Object.entries(occ).sort((a, b) => b[1] - a[1]).filter(([, val]) => val > 0) as [string, number][]
    };
  }, [filteredByScope, selectedCohort]);

  /** Stalled workers breakdowns: occupational mix + stall duration distribution */
  const stalledBreakdowns = useMemo(() => {
    const occMix: Record<string, number> = {};
    filteredByScope.forEach(d => {
      occMix[d.SOC_2019_5_ACS_NAME] = (occMix[d.SOC_2019_5_ACS_NAME] || 0) + d.estimated_stalled_only;
    });

    // Duration histogram from pre-binned data
    const durations: [string, number][] = TENURE_LABELS.map((label, i) => {
      const key = TENURE_KEYS[i];
      const total = durationByScope.reduce((sum, d) => sum + (Number(d[key]) || 0), 0);
      return [label, total];
    });

    return {
      occMix: Object.entries(occMix).sort((a, b) => b[1] - a[1]).filter(([, val]) => val > 0) as [string, number][],
      durations,
    };
  }, [filteredByScope, durationByScope]);

  // Auto-select top occupation when filters change
  useEffect(() => {
    if (cohortBreakdowns.occ.length > 0) {
      setTargetOccupation(cohortBreakdowns.occ[0][0]);
    }
  }, [sector, selectedCohort, geography, cohortBreakdowns.occ]);

  // Reset destination when occupation or pathway mode changes
  useEffect(() => {
    setSelectedDestination(null);
    setExpandedRec(null);
  }, [targetOccupation, pathwayMode]);

  // --- Section 03: Occupation diagnostics from pathway data ---
  const occupationDiagnostics = useMemo(() => {
    if (!targetOccupation) return null;
    const row = nationalTransitions.find(r => r.SOC_2019_5_ACS_NAME_SOURCE === targetOccupation)
      || occSimilarity.find(r => r.SOC_2019_5_ACS_NAME_SOURCE === targetOccupation);
    if (!row) return null;
    return {
      strandedShare: row.share_stranded_SOURCE,
      medianWage: row.a_median_SOURCE,
      partTimeShare: row.share_part_time_SOURCE,
    };
  }, [targetOccupation]);

  // --- Section 04: Pathway destinations ---
  const destinationPathways = useMemo(() => {
    if (!targetOccupation) return [];
    if (pathwayMode === 'transitions') {
      const transResults = nationalTransitions
        .filter(r => r.SOC_2019_5_ACS_NAME_SOURCE === targetOccupation)
        .sort((a, b) => (b.at_year_5_national || 0) - (a.at_year_5_national || 0))
        .slice(0, 5);
      // Fall back to similarity if no transitions found
      if (transResults.length === 0) {
        return occSimilarity
          .filter(r => r.SOC_2019_5_ACS_NAME_SOURCE === targetOccupation)
          .sort((a, b) => b.standardized_similarity - a.standardized_similarity)
          .slice(0, 5)
          .map(r => ({ ...r, _fallback: true }));
      }
      return transResults;
    } else {
      return occSimilarity
        .filter(r => r.SOC_2019_5_ACS_NAME_SOURCE === targetOccupation)
        .sort((a, b) => b.standardized_similarity - a.standardized_similarity)
        .slice(0, 5);
    }
  }, [targetOccupation, pathwayMode]);

  const isTransitionFallback = pathwayMode === 'transitions' && destinationPathways.length > 0 && (destinationPathways[0] as any)?._fallback;

  // --- Skill gaps for selected origin → destination ---
  const selectedSkillGaps = useMemo(() => {
    if (!targetOccupation || !selectedDestination) return [];
    const skillMap: Record<string, SkillGapRow> = {};
    skillGapsTop5
      .filter(r => r.origin_occupation === targetOccupation && r.destination_occupation === selectedDestination && r.skill_gap > 0)
      .forEach(r => {
        if (!skillMap[r.SKILL_NAME] || r.skill_gap > skillMap[r.SKILL_NAME].skill_gap) {
          skillMap[r.SKILL_NAME] = r;
        }
      });
    return Object.values(skillMap)
      .sort((a, b) => b.skill_gap - a.skill_gap)
      .slice(0, 5);
  }, [targetOccupation, selectedDestination]);

  // --- Credential-related skills from job postings ---
  const credentialSkills = useMemo(() => {
    if (!targetOccupation || !selectedDestination) return [];
    return skillGapsTop5
      .filter(r => r.origin_occupation === targetOccupation && r.destination_occupation === selectedDestination && r.skill_gap > 0)
      .filter(s => CREDENTIAL_PATTERNS.some(p => p.test(s.SKILL_NAME)))
      .filter(s => isCredentialRelevantToOccupation(s.SKILL_NAME, selectedDestination))
      .sort((a, b) => b.destination_importance - a.destination_importance);
  }, [targetOccupation, selectedDestination]);

  // --- Cross-pathway skill acquisition (pre-computed subcategory aggregations) ---
  const crossPathwaySkills = useMemo(() => {
    if (!targetOccupation) return [];
    return crossPathwaySkillsData
      .filter(r => r.origin_occupation === targetOccupation)
      .sort((a, b) => b.n_destination_occs - a.n_destination_occs || b.avg_skill_gap - a.avg_skill_gap)
      .slice(0, 5)
      .map(r => ({
        skill: r.SKILL_SUBCATEGORY_NAME,
        count: r.n_destination_occs,
        totalDests: r.total_destination_occs,
        importance: r.avg_skill_gap,
      }));
  }, [targetOccupation]);

  // --- Selected destination row (for sidebar metrics) ---
  const selectedDestRow = useMemo(() => {
    if (!selectedDestination || !targetOccupation) return null;
    return nationalTransitions.find(r => r.SOC_2019_5_ACS_NAME_SOURCE === targetOccupation && r.SOC_2019_5_ACS_NAME_TARGET === selectedDestination)
      || occSimilarity.find(r => r.SOC_2019_5_ACS_NAME_SOURCE === targetOccupation && r.SOC_2019_5_ACS_NAME_TARGET === selectedDestination)
      || null;
  }, [targetOccupation, selectedDestination]);

  // ============================================================================
  // EXPORT EXECUTIVE BRIEF
  // ============================================================================

  const handleExportBrief = () => {
    const renderReportBar = (label: string, value: number, max: number, color: string = '#1e3a8a') => `
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">
          <span>${label}</span><span>${value.toLocaleString()}</span>
        </div>
        <div style="height: 8px; width: 100%; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; width: ${max > 0 ? (value / max) * 100 : 0}%; background: ${color}; border-radius: 4px;"></div>
        </div>
      </div>`;

    const maxOcc = Math.max(...cohortBreakdowns.occ.map(x => x[1]));

    const reportHtml = `<html><head><title>Executive Brief: Stranded Talent Strategy</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
        * { box-sizing: border-box; } body { font-family: 'Inter', sans-serif; padding: 0; margin: 0; color: #1e293b; background: #fff; }
        .page { padding: 60px 70px 100px 70px; min-height: 100vh; page-break-after: always; position: relative; }
        .header { border-bottom: 4px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 35px; display: flex; justify-content: space-between; align-items: flex-end; }
        .header h1 { margin: 0; text-transform: uppercase; font-size: 24px; color: #1e3a8a; font-weight: 800; letter-spacing: -0.025em; }
        .header .meta { text-align: right; font-size: 10px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.8; }
        h2 { color: #1e3a8a; border-left: 6px solid #f59e0b; padding-left: 12px; text-transform: uppercase; font-size: 14px; margin-top: 0; margin-bottom: 18px; font-weight: 800; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
        .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; text-align: center; }
        .stat-val { font-size: 28px; font-weight: 800; color: #1e40af; display: block; letter-spacing: -0.05em; }
        .stat-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 8px; }
        .content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 35px; }
        .rec-card { background: #1e3a8a; color: white; padding: 28px; border-radius: 16px; margin-bottom: 18px; page-break-inside: avoid; }
        .rec-card h3 { color: #f59e0b; margin: 0 0 10px 0; text-transform: uppercase; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; }
        .rec-title { font-size: 16px; font-weight: 800; margin: 0 0 12px 0; color: #fef3c7; }
        .rec-advice { font-size: 13px; line-height: 1.6; margin: 0; color: #e2e8f0; font-weight: 400; }
        .footer { position: absolute; bottom: 40px; left: 70px; right: 70px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 8px; color: #94a3b8; text-align: center; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; }
        @media print { .page { min-height: 100vh; height: auto; } .rec-card { page-break-inside: avoid; } }
      </style></head><body>
      <div class="page">
        <div class="header"><div>
          <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em;">Phase I: Diagnostic Inventory</p>
          <h1>Stranded Talent Analysis</h1>
        </div><div class="meta">Region: ${geography === 'All' ? 'All Tennessee' : geography + ' MSA'}<br>Industry: ${sector}<br>Briefing Date: ${new Date().toLocaleDateString()}</div></div>
        <div class="stat-grid">
          <div class="stat-box"><span class="stat-label">Total Scope</span><span class="stat-val">${stats.total.toLocaleString()}</span></div>
          <div class="stat-box"><span class="stat-label">Low Wage</span><span class="stat-val">${stats.lw.toLocaleString()}</span></div>
          <div class="stat-box"><span class="stat-label">Underemployed</span><span class="stat-val">${stats.ue.toLocaleString()}</span></div>
          <div class="stat-box"><span class="stat-label">Stalled</span><span class="stat-val">${Math.round(stats.st).toLocaleString()}</span></div>
        </div>
        <div>
          <h2>Occupational Distribution: ${selectedCohort}</h2>
          <p style="font-size: 11px; color: #64748b; margin: 0 0 18px 0; text-transform: uppercase; font-weight: 800;">Primary Target Nodes</p>
          ${cohortBreakdowns.occ.slice(0, 12).map(([l, v]) => renderReportBar(l, v, maxOcc, '#10b981')).join('')}
        </div>
        <div class="footer">Tennessee BGI Strategic Workforce Initiative | Executive Confidential</div>
      </div>
      <div class="page">
        <div class="header"><div>
          <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em;">Phase II: Career Pathways</p>
          <h1>Destination Analysis</h1>
        </div><div class="meta">Focus Occupation: ${targetOccupation}<br>Target Cohort: ${selectedCohort}</div></div>
        <p style="font-size: 13px; line-height: 1.6; color: #334155; margin: 0 0 30px 0;">
          Career pathway analysis for <strong>${targetOccupation}</strong> within <strong>${geography === 'All' ? 'Tennessee' : geography}</strong>. Top destination occupations identified through observed transitions and skill similarity scoring.</p>
        ${destinationPathways.map((p, i) => `<div class="rec-card">
          <h3>Destination ${String(i + 1).padStart(2, '0')}</h3>
          <p class="rec-title">${p.SOC_2019_5_ACS_NAME_TARGET}</p>
          <p class="rec-advice">Wage Gain: +$${p.potential_wage_gain.toLocaleString()} (${Math.round(p.potential_wage_gain_pct * 100)}%) | Similarity: ${p.similarity_rating ? p.similarity_rating.charAt(0).toUpperCase() + p.similarity_rating.slice(1) : '—'} | Strandedness Change: ${Math.round(p.diff_strandedness * 100)}% | TN Demand: ${p.demand_category_TARGET || 'N/A'}</p>
        </div>`).join('')}
        <div class="footer">Tennessee BGI Strategic Workforce Initiative | Executive Confidential</div>
      </div>
      <script>window.print();</script></body></html>`;

    const win = window.open('', '_blank');
    win?.document.write(reportHtml);
    win?.document.close();
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Treemap layout computation for Section 02
  const treemapTotal = stats.lw + stats.ue + stats.st;
  const treemapItems: { key: CohortType; label: string; value: number; pct: number; color: string; selectedColor: string; textColor: string; tooltip: string }[] = [
    {
      key: 'Low Wage', label: 'Low Wage', value: stats.lw,
      pct: treemapTotal > 0 ? (stats.lw / treemapTotal) * 100 : 33,
      color: 'bg-blue-100 border-blue-200', selectedColor: 'bg-blue-600 border-blue-700',
      textColor: 'text-blue-900', tooltip: 'Workers earning annual wages below $30,493 (two-thirds of MIT Living Wage for Tennessee). These workers struggle to meet basic living expenses despite being employed.'
    },
    {
      key: 'Underemployed', label: 'Underemployed', value: stats.ue,
      pct: treemapTotal > 0 ? (stats.ue / treemapTotal) * 100 : 33,
      color: 'bg-amber-100 border-amber-200', selectedColor: 'bg-amber-500 border-amber-600',
      textColor: 'text-amber-900', tooltip: 'Workers whose education exceeds their job requirements by 2+ levels (Associate\'s or below) or 1+ level (Bachelor\'s or above), AND earning $45,739 or less annually.'
    },
    {
      key: 'Stalled', label: 'Career Stalled', value: Math.round(stats.st),
      pct: treemapTotal > 0 ? (stats.st / treemapTotal) * 100 : 34,
      color: 'bg-emerald-100 border-emerald-200', selectedColor: 'bg-emerald-500 border-emerald-600',
      textColor: 'text-emerald-900', tooltip: 'Workers who have remained in the same low-wage job for 3+ years without meaningful wage progression. Economically stuck — employed but unable to advance.'
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 font-['Inter']">
      {/* ================================================================
          NAV BAR
          ================================================================ */}
      <nav className="bg-[#1E3A8A] text-white py-4 px-4 md:py-6 md:px-10 shadow-xl sticky top-0 z-50 flex flex-col md:flex-row items-start md:items-center justify-between border-b-4 border-amber-500 gap-4 md:gap-0">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="p-2 md:p-3 bg-white/10 rounded-2xl shadow-inner backdrop-blur-md">
            <LayoutDashboard size={24} className="md:w-7 md:h-7" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-black uppercase tracking-tighter">Stranded Talent Interactive</h1>
            <p className="text-[9px] md:text-[10px] font-bold text-amber-400 uppercase tracking-widest mt-1">Tennessee BGI Policy Dashboard</p>
          </div>
        </div>
        <button onClick={handleExportBrief}
          className="flex items-center gap-2 md:gap-3 bg-white hover:bg-slate-100 text-blue-950 px-4 py-2 md:px-8 md:py-3 rounded-2xl font-black text-xs uppercase transition-all shadow-xl active:scale-95 group w-full md:w-auto justify-center">
          <Download size={16} className="md:w-[18px] md:h-[18px] group-hover:translate-y-0.5 transition-transform" />
          <span className="hidden sm:inline">Export Executive Brief</span><span className="sm:hidden">Export Brief</span>
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-10 py-8 md:py-12 space-y-12 md:space-y-24">

        {/* ================================================================
            SECTION 01: REGIONAL & SECTOR SCOPE
            ================================================================ */}
        <section className="space-y-6 md:space-y-10">
          <div className="flex items-center gap-3 md:gap-4 border-b-2 border-slate-200 pb-4 md:pb-6">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs md:text-sm shadow-inner flex-shrink-0">01</div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Regional & Sector Scope</h2>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-2">Baseline Diagnostic Definition</p>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-7">
              <div className="bg-white p-6 md:p-10 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                  <MapPin size={12} className="text-blue-500" /> Geography
                </h4>
                <TennesseeMap selectedRegion={geography} onRegionClick={setGeography} />
              </div>
            </div>
            <div className="col-span-12 lg:col-span-5 flex flex-col justify-center gap-6">
              <div className="bg-white p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                  <Briefcase size={14} className="text-blue-500" /> NAICS Sector
                </label>
                <div className="relative">
                  <select value={sector} onChange={(e) => setSector(e.target.value)}
                    className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-[24px] px-8 py-5 text-sm font-black appearance-none focus:border-blue-500 transition-all outline-none pr-16">
                    {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"><ChevronDown size={24} /></div>
                </div>
                <div className="mt-8 md:mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="p-5 md:p-6 bg-blue-900 rounded-[24px] md:rounded-[32px] text-white">
                    <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-2">Total Workers</p>
                    <p className="text-2xl md:text-3xl font-black">{stats.total.toLocaleString()}</p>
                  </div>
                  <div className="p-5 md:p-6 bg-amber-500 rounded-[24px] md:rounded-[32px] text-blue-950">
                    <p className="text-[10px] font-black text-blue-950/40 uppercase tracking-widest mb-2">Stranded Rate</p>
                    <p className="text-2xl md:text-3xl font-black">{stats.total > 0 ? (((stats.lw + stats.ue + stats.st) / stats.total) * 100).toFixed(0) : 0}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 02: THE STRANDED LANDSCAPE (Treemap + Diagnostics)
            ================================================================ */}
        <section className="space-y-6 md:space-y-10">
          <div className="flex items-center gap-3 md:gap-4 border-b-2 border-slate-200 pb-4 md:pb-6">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs md:text-sm shadow-inner flex-shrink-0">02</div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 uppercase tracking-tight leading-none">The Stranded Landscape</h2>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-2">Mutually Exclusive Cohort Identification</p>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-10">
            {/* Cohort visualization */}
            <div className="col-span-12 lg:col-span-6 bg-white p-6 md:p-10 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200 flex flex-col">
              <div className="flex items-center justify-between mb-5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <BarChart3 size={12} className="text-blue-500" /> Stranded Worker Cohorts
                </h4>
                <button onClick={() => setSelectedCohort('All Stranded')}
                  className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all ${
                    selectedCohort === 'All Stranded' ? 'bg-blue-900 text-white shadow' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                  All ({Math.round(treemapTotal).toLocaleString()})
                </button>
              </div>

              {/* Three horizontal bar rows — one per cohort */}
              <div className="flex-1 flex flex-col justify-between gap-3">
                {(() => {
                  const maxVal = Math.max(...treemapItems.map(t => t.value), 1);
                  const barFill: Record<string, string> = {
                    'Low Wage': 'bg-blue-500',
                    'Underemployed': 'bg-amber-500',
                    'Career Stalled': 'bg-emerald-500',
                  };
                  const dotColor: Record<string, string> = {
                    'Low Wage': 'bg-blue-500',
                    'Underemployed': 'bg-amber-500',
                    'Career Stalled': 'bg-emerald-500',
                  };
                  const activeBorder: Record<string, string> = {
                    'Low Wage': 'border-blue-400',
                    'Underemployed': 'border-amber-400',
                    'Career Stalled': 'border-emerald-400',
                  };

                  return treemapItems.map(item => {
                    const isExact = selectedCohort === item.key;
                    const isAll = selectedCohort === 'All Stranded';
                    const barWidth = (item.value / maxVal) * 100;

                    return (
                      <div key={item.key}
                        onClick={() => setSelectedCohort(item.key)}
                        className={`relative group cursor-pointer flex-1 flex flex-col justify-between p-5 rounded-2xl border-2 transition-all duration-300 ${
                          isExact
                            ? `bg-white ${activeBorder[item.label]} shadow-md`
                            : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm'
                        } ${!isExact && !isAll ? 'opacity-60 hover:opacity-100' : ''}`}>

                        {/* Label + stats row */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor[item.label]}`} />
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">{item.label}</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-slate-800 tabular-nums">{Math.round(item.value).toLocaleString()}</span>
                            <span className="text-xs font-bold text-slate-400">{item.pct.toFixed(0)}%</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${barFill[item.label]}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>

                        {/* Tooltip */}
                        <div className="invisible group-hover:visible absolute z-50 w-72 p-3 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none">
                          <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 mb-1">{item.label}</div>
                          <div className="text-xs leading-relaxed">{item.tooltip}</div>
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-slate-900" />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Footer */}
              <div className="mt-5 flex items-center justify-between">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Share of sector workforce</p>
                <p className="text-[10px] font-black text-slate-600">
                  {stats.total > 0 ? (((stats.lw + stats.ue + stats.st) / stats.total) * 100).toFixed(1) : 0}% stranded
                </p>
              </div>
            </div>

            {/* Diagnostics panel */}
            <div className="col-span-12 lg:col-span-6 bg-white p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 md:mb-10">Diagnostics: {selectedCohort}</h4>
              <div className="space-y-6">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Briefcase size={14} className={selectedCohort === 'Stalled' ? 'text-emerald-500' : 'text-blue-500'} />
                  {selectedCohort === 'Stalled' ? 'Stalled Occupational Mix' : 'Occupational Distribution'}
                </p>
                <div className="space-y-5">
                  {(selectedCohort === 'Stalled' ? stalledBreakdowns.occMix : cohortBreakdowns.occ).length > 0
                    ? (selectedCohort === 'Stalled' ? stalledBreakdowns.occMix : cohortBreakdowns.occ).slice(0, 8).map(([label, val]) => (
                        <ProgressBar key={label} label={label} value={Math.round(val)}
                          max={Math.round((selectedCohort === 'Stalled' ? stalledBreakdowns.occMix : cohortBreakdowns.occ)[0][1])}
                          colorClass={selectedCohort === 'Stalled' ? 'bg-emerald-500' : selectedCohort === 'Low Wage' ? 'bg-blue-500' : selectedCohort === 'Underemployed' ? 'bg-amber-500' : 'bg-blue-600'} />
                      ))
                    : <p className="text-xs text-slate-400 italic">No workers in this selection.</p>}
                </div>
              </div>
              {selectedCohort === 'Stalled' && (
                <div className="mt-8 md:mt-10 pt-8 md:pt-10 border-t border-slate-100 space-y-6">
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={14} className="text-emerald-700"/> Stall Duration</p>
                  <div className="space-y-5">
                    {(() => {
                      const maxDur = Math.max(...stalledBreakdowns.durations.map(([, v]) => v as number), 1);
                      return stalledBreakdowns.durations.map(([label, val]) => (
                        <ProgressBar key={label} label={label} value={Math.round(val as number)} max={Math.round(maxDur)} colorClass="bg-emerald-700" />
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 03: OCCUPATIONAL SELECTION
            ================================================================ */}
        <section className="space-y-6 md:space-y-10">
          <div className="flex items-center gap-3 md:gap-4 border-b-2 border-slate-200 pb-4 md:pb-6">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs md:text-sm shadow-inner flex-shrink-0">03</div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Occupational Selection</h2>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-2">Drill-Down to Targeted Intervention Nodes</p>
            </div>
          </div>

          <div className="bg-white p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6">
              {cohortBreakdowns.occ.slice(0, 10).map(([occ, val]) => (
                <div key={occ} onClick={() => setTargetOccupation(occ)}
                  className={`p-5 md:p-6 rounded-[24px] md:rounded-[32px] border-2 cursor-pointer transition-all duration-300 ${
                    targetOccupation === occ ? 'bg-blue-900 border-blue-900 shadow-xl -translate-y-1' : 'bg-white border-slate-100 hover:border-blue-300'}`}>
                  <p className={`font-black uppercase tracking-tighter text-xs md:text-sm mb-3 md:mb-4 truncate ${targetOccupation === occ ? 'text-blue-200' : 'text-slate-800'}`}>{occ}</p>
                  <div className="flex justify-between items-center">
                    <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${targetOccupation === occ ? 'text-blue-400' : 'text-slate-400'}`}>
                      {selectedCohort === 'All Stranded' ? 'Stranded Workers' : `${selectedCohort} Workers`}
                    </span>
                    <span className={`text-base md:text-lg font-black ${targetOccupation === occ ? 'text-white' : 'text-blue-950'}`}>{Math.round(val).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Occupation Diagnostic Panel */}
            {targetOccupation && occupationDiagnostics && (
              <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-slate-100">
                <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 md:mb-6 flex items-center gap-2">
                  <Target size={14} className="text-blue-500" /> Occupation Diagnostics: {targetOccupation}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 md:gap-6">
                  <div className="p-4 md:p-6 bg-slate-50 rounded-[20px] md:rounded-[24px] border border-slate-100">
                    <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Stranded Share</p>
                    <p className="text-xl md:text-2xl font-black text-blue-900">{(occupationDiagnostics.strandedShare * 100).toFixed(1)}%</p>
                    <p className="text-[9px] text-slate-400 mt-1">of workers in this occupation are stranded</p>
                  </div>
                  <div className="p-4 md:p-6 bg-slate-50 rounded-[20px] md:rounded-[24px] border border-slate-100">
                    <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Median Wage</p>
                    <p className="text-xl md:text-2xl font-black text-blue-900">${occupationDiagnostics.medianWage.toLocaleString()}</p>
                    <p className="text-[9px] text-slate-400 mt-1">annual median for this occupation</p>
                  </div>
                  <div className="p-4 md:p-6 bg-slate-50 rounded-[20px] md:rounded-[24px] border border-slate-100 group relative">
                    <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Part-Time Share</p>
                    <p className="text-xl md:text-2xl font-black text-blue-900">{(occupationDiagnostics.partTimeShare * 100).toFixed(1)}%</p>
                    <p className="text-[9px] text-slate-400 mt-1">working part-time in this occupation</p>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-56 text-center z-50 shadow-lg">
                      Share of workers working part-time, among those working at least 15 hours per week.
                    </div>
                  </div>
                  {/* TN Demand for this occupation */}
                  <div className="p-4 md:p-6 bg-slate-50 rounded-[20px] md:rounded-[24px] border border-slate-100">
                    <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">TN Demand</p>
                    <DemandBadge occupation={targetOccupation} sector={sector} />
                    {(() => {
                      const growth = growthByOcc.get(targetOccupation);
                      return growth?.share_growth_trend ? (
                        <p className="text-[9px] text-slate-400 mt-2">Trend: {growth.share_growth_trend}</p>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================
            SECTION 04: POLICY ROADMAP — CAREER PATHWAYS
            ================================================================ */}
        <section className="space-y-6 md:space-y-10">
          <div className="flex items-center gap-3 md:gap-4 border-b-2 border-slate-200 pb-4 md:pb-6">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs md:text-sm shadow-inner flex-shrink-0">04</div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Policy Roadmap</h2>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-2">Career Pathways & Strategic Interventions</p>
            </div>
          </div>

          {/* 4a. Pathway Mode Selector */}
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-3 hidden sm:block">Pathway Mode</p>
            <div className="inline-flex rounded-full bg-slate-100 p-1 border border-slate-200">
              <button onClick={() => setPathwayMode('transitions')}
                className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-wider transition-all ${
                  pathwayMode === 'transitions' ? 'bg-blue-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                Historically Common Transitions
              </button>
              <button onClick={() => setPathwayMode('similarity')}
                className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-wider transition-all ${
                  pathwayMode === 'similarity' ? 'bg-blue-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                Jobs with Highly Similar Skills
              </button>
            </div>
          </div>

          {/* 4b. Destination Pathways Panel */}
          {targetOccupation && (
            <div className="bg-white p-6 md:p-10 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <ArrowRight size={16} className="text-amber-500 flex-shrink-0" />
                <p className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-500">
                  {pathwayMode === 'transitions' && !isTransitionFallback ? 'Top Observed Transitions' : 'Most Skill-Similar Occupations'} for {pluralize(targetOccupation)}
                </p>
              </div>
              {isTransitionFallback && (
                <p className="text-xs text-amber-600 font-medium mb-4 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
                  No observed transition data available for this occupation. Showing skill-similar occupations instead.
                </p>
              )}

              {destinationPathways.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4">
                  {destinationPathways.map((p, i) => {
                    const wagePct = Math.round(p.potential_wage_gain_pct * 100);
                    const strandPct = Math.round(p.diff_strandedness * 100);
                    const isSelected = selectedDestination === p.SOC_2019_5_ACS_NAME_TARGET;
                    return (
                      <div key={i} onClick={() => setSelectedDestination(p.SOC_2019_5_ACS_NAME_TARGET)}
                        className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border-2 cursor-pointer transition-all duration-300 ${
                          isSelected ? 'bg-blue-900 border-blue-900 shadow-xl -translate-y-1' : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-sm'}`}>
                        <p className={`text-xs md:text-sm font-black leading-snug mb-3 ${isSelected ? 'text-blue-200' : 'text-slate-800'}`}>{p.SOC_2019_5_ACS_NAME_TARGET}</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Wage Gain</span>
                            <span className={`text-[11px] md:text-xs font-black ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`}>
                              +${p.potential_wage_gain.toLocaleString()} ({wagePct > 0 ? `+${wagePct}` : wagePct}%)
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Strandedness</span>
                            <span className={`text-[11px] md:text-xs font-black ${strandPct < 0 ? (isSelected ? 'text-emerald-300' : 'text-emerald-600') : (isSelected ? 'text-red-300' : 'text-red-500')}`}>
                              {strandPct < 0 ? `${strandPct}%` : `+${strandPct}%`}
                            </span>
                          </div>
                          {pathwayMode === 'transitions' && (p.at_year_5_national || 0) > 0 && (
                            <div className="flex items-center justify-between">
                              <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Observed</span>
                              <span className={`text-[11px] md:text-xs font-black ${isSelected ? 'text-white' : 'text-slate-700'}`}>{p.at_year_5_national} workers</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Similarity</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              p.similarity_rating === 'high' ? (isSelected ? 'bg-emerald-400/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700') :
                              p.similarity_rating === 'medium' ? (isSelected ? 'bg-amber-400/20 text-amber-300' : 'bg-amber-100 text-amber-700') :
                              (isSelected ? 'bg-red-400/20 text-red-300' : 'bg-red-100 text-red-700')
                            }`}>{p.similarity_rating ? p.similarity_rating.charAt(0).toUpperCase() + p.similarity_rating.slice(1) : '—'}</span>
                          </div>
                          {/* Demand badge for destination */}
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>TN Demand</span>
                            <DemandBadge occupation={p.SOC_2019_5_ACS_NAME_TARGET} sector={sector} compact isSelected={isSelected} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-slate-400 font-bold">No pathway data available for this occupation in the selected mode.</p>
                  <p className="text-xs text-slate-300 mt-2">Try switching to {pathwayMode === 'transitions' ? '"Jobs with Highly Similar Skills"' : '"Historically Common Transitions"'} mode.</p>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              4c. Strategy Recommendations (when destination is selected)
              ================================================================ */}
          {targetOccupation && selectedDestination && selectedDestRow && (
            <div className="grid grid-cols-12 gap-10">
              <div className="col-span-12 lg:col-span-7 space-y-4 md:space-y-6">

                {/* Strategy 1: Career Advancement Pathways (Skill Gaps) */}
                <div onClick={() => setExpandedRec(expandedRec === 0 ? null : 0)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 0 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <BarChart3 size={18} className={expandedRec === 0 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 0 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Career Advancement Pathways</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 0 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 0 && (
                    <div className="mt-6 md:mt-8" onClick={e => e.stopPropagation()}>
                      <p className="text-sm text-slate-600 mb-4">
                        Based on BGI analysis of job postings data, these are the top skills that workers in <span className="font-bold">{targetOccupation}</span> roles
                        would need to develop to transition into <span className="font-bold">{selectedDestination}</span> positions.
                        Skills are ranked by the size of the gap between the two occupations.
                      </p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Top Skill Gaps</p>
                      {selectedSkillGaps.length > 0 ? (
                        <div className="space-y-2">
                          {selectedSkillGaps.slice(0, 5).map((s, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs flex-shrink-0">{i + 1}</div>
                              <p className="text-sm font-bold text-slate-700">{s.SKILL_NAME}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No skill gap data available for this transition.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Strategy 2: Credentials & Licensing */}
                <div onClick={() => setExpandedRec(expandedRec === 1 ? null : 1)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 1 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <GraduationCap size={18} className={expandedRec === 1 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 1 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Credentials & Licensing</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 1 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 1 && (
                    <div className="mt-6 md:mt-8" onClick={e => e.stopPropagation()}>
                      {(() => {
                        const destLicenses = selectedDestination ? tnLicenses[selectedDestination] : undefined;
                        const destCommonCreds = selectedDestination ? commonCredentials[selectedDestination] : undefined;
                        const hasStatutory = destLicenses && destLicenses.length > 0;
                        const hasCommon = destCommonCreds && destCommonCreds.length > 0;

                        return (
                          <div className="space-y-4">
                            {/* Statutory requirements */}
                            {hasStatutory && (
                              <>
                                <p className="text-sm text-slate-600 font-medium">
                                  Tennessee requires occupational licensing for professionals in <span className="font-bold">{selectedDestination}</span> roles:
                                </p>
                                {destLicenses!.map((lic, i) => (
                                  <div key={i} className="flex items-center gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                                    <GraduationCap size={18} className="text-amber-700 flex-shrink-0" />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm font-black text-slate-800">{lic.profession}</h4>
                                        <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full uppercase">Required by TN Law</span>
                                        {lic.regulation && <span className="text-[10px] font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full uppercase">{lic.regulation}</span>}
                                      </div>
                                      {lic.degree && lic.degree !== 'None' && (
                                        <p className="text-xs text-slate-500 mt-1">Requires: <span className="font-bold text-slate-700">{lic.degree}</span></p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}

                            {/* Common industry expectations */}
                            {hasCommon && (
                              <>
                                <p className="text-sm text-slate-600 font-medium mt-2">
                                  {hasStatutory ? 'Additionally, employers' : 'While no TN state license is required, employers'} commonly expect the following credentials for <span className="font-bold">{selectedDestination}</span> roles:
                                </p>
                                {destCommonCreds!.map((cred, i) => (
                                  <div key={i} className="flex items-center gap-4 p-4 bg-blue-50 rounded-2xl border border-blue-200">
                                    <FileText size={18} className="text-blue-600 flex-shrink-0" />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm font-black text-slate-800">{cred.credential}</h4>
                                        <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">Commonly Expected</span>
                                      </div>
                                      <p className="text-xs text-slate-500 mt-1">{cred.description}</p>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}

                            {/* Credential-related skills from job postings */}
                            {credentialSkills.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Related credentials from job postings</p>
                                <div className="flex flex-wrap gap-2">
                                  {credentialSkills.map((s, i) => (
                                    <span key={i} className="text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full">{s.SKILL_NAME}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Fallback if nothing found */}
                            {!hasStatutory && !hasCommon && credentialSkills.length === 0 && (
                              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-sm text-slate-600 font-medium">No Tennessee state license or specific credential requirements were identified for {selectedDestination}.</p>
                                <p className="text-xs text-slate-400 mt-2">This occupation does not appear in the Knee Center's Tennessee occupational licensing database, and no common industry credentials were identified. We recommend checking industry certification bodies for voluntary credentials that may improve employability.</p>
                              </div>
                            )}

                            {(hasStatutory || hasCommon) && (
                              <p className="text-xs text-slate-400 mt-2">Sources: Knee Center for the Study of Occupational Regulation (TN state data, 2025); BGI job postings analysis; industry standards research.</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Strategy 3: Employer Mobility Within Occupation */}
                <div onClick={() => setExpandedRec(expandedRec === 2 ? null : 2)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 2 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Briefcase size={18} className={expandedRec === 2 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 2 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Employer Mobility Within Occupation</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 2 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 2 && (
                    <div className="mt-6 md:mt-8" onClick={e => e.stopPropagation()}>
                      {occupationDiagnostics && (
                        <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100">
                          <p className="text-sm md:text-base text-slate-700 leading-relaxed font-medium">
                            Not all {pluralize(targetOccupation)} are stranded &mdash; <span className="font-black text-blue-900">{((1 - occupationDiagnostics.strandedShare) * 100).toFixed(1)}%</span> in this occupation are not classified as stranded. For workers who want to stay in their current field, switching employers can unlock wage growth. Internal mobility and job-hopping within the same occupation is a viable strategy.
                          </p>
                          <div className="mt-4 flex items-center gap-6">
                            <div>
                              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Non-Stranded Rate</p>
                              <p className="text-lg font-black text-blue-900">{((1 - occupationDiagnostics.strandedShare) * 100).toFixed(1)}%</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Current Median Wage</p>
                              <p className="text-lg font-black text-blue-900">${occupationDiagnostics.medianWage.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Strategy 4: Cross-Pathway Skill Acquisition */}
                <div onClick={() => setExpandedRec(expandedRec === 3 ? null : 3)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 3 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Layers size={18} className={expandedRec === 3 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 3 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Cross-Pathway Skill Acquisition</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 3 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 3 && (
                    <div className="mt-6 md:mt-8" onClick={e => e.stopPropagation()}>
                      <p className="text-sm text-slate-600 font-medium mb-4">
                        Skills that appear as gaps across multiple destination pathways for {pluralize(targetOccupation)}. Investing in these skills maximizes career flexibility.
                      </p>
                      {crossPathwaySkills.length > 0 ? (
                        <div className="space-y-3">
                          {crossPathwaySkills.map((s, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs flex-shrink-0">{i + 1}</div>
                                <p className="text-sm font-black text-slate-800">{s.skill}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-blue-600">{s.count} of {s.totalDests}</p>
                                <p className="text-[9px] text-slate-400 uppercase tracking-widest">pathways</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No cross-pathway skill data available for this occupation.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Target Group Profile Sidebar */}
              <div className="col-span-12 lg:col-span-5">
                <div className="bg-[#1E3A8A] text-white p-6 md:p-12 rounded-[32px] md:rounded-[50px] shadow-2xl relative overflow-hidden h-full flex flex-col border-t-4 md:border-t-8 border-amber-500">
                  <div className="relative z-10">
                    <h3 className="text-xl md:text-2xl font-black leading-tight mb-6 md:mb-8 tracking-tighter uppercase text-amber-400">Target Group Profile</h3>
                    <div className="mb-6 md:mb-10 space-y-3 md:space-y-4">
                      {[
                        ['Region', geography],
                        ['Sector', sector],
                        ['Origin', targetOccupation],
                        ['Destination', selectedDestination],
                        ['Cohort', selectedCohort],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between border-b border-white/10 pb-2 md:pb-3">
                          <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">{label}</span>
                          <span className={`font-bold text-xs md:text-sm truncate max-w-[150px] md:max-w-[200px] ${label === 'Destination' ? 'text-amber-400' : ''}`}>{value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-6 md:space-y-10">
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <TrendingUp size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Wage Gain</p>
                          <p className="text-2xl md:text-3xl font-black">+${selectedDestRow.potential_wage_gain.toLocaleString()}</p>
                          <p className="text-[10px] text-blue-300 mt-1">
                            {Math.round(selectedDestRow.potential_wage_gain_pct * 100)}% increase &bull; To ${selectedDestRow.a_median_TARGET.toLocaleString()}/yr
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <Target size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Strandedness Change</p>
                          <p className={`text-2xl md:text-3xl font-black ${selectedDestRow.diff_strandedness < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Math.round(selectedDestRow.diff_strandedness * 100)}%
                          </p>
                          <p className="text-[10px] text-blue-300 mt-1">
                            Destination stranded rate: {(selectedDestRow.share_stranded_TARGET * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <Layers size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Skill Similarity</p>
                          <p className="text-2xl md:text-3xl font-black capitalize">{selectedDestRow.similarity_rating || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <Flame size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">TN Demand</p>
                          <DemandBadge occupation={selectedDestination} sector={sector} />
                          {(() => {
                            const growth = growthByOcc.get(selectedDestination);
                            return growth?.share_growth_trend ? (
                              <p className="text-[10px] text-blue-300 mt-1">Trend: {growth.share_growth_trend}</p>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <Users size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Workers in Pool</p>
                          <p className="text-2xl md:text-3xl font-black">{Math.round(cohortBreakdowns.occ.find(d => d[0] === targetOccupation)?.[1] || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

      </main>

      <footer className="max-w-7xl mx-auto px-4 md:px-10 py-8 md:py-16 border-t border-slate-200 text-slate-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-center flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
        <span className="text-center md:text-left">BGI Data Analytics &copy; 2026 | Tennessee Strategic Workforce Dashboard</span>
        <div className="flex gap-6 md:gap-10">
          <a href="#" className="hover:text-blue-600">Methodology</a>
          <a href="#" className="hover:text-blue-600">Source Data</a>
        </div>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
