import React, { useState, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MapPin,
  Briefcase,
  Target,
  Download,
  Users,
  GraduationCap,
  ArrowRight,
  ChevronDown,
  LayoutDashboard,
  BarChart3,
  Layers,
  FileText,
  TrendingUp,
  Map as MapIcon
} from 'lucide-react';
import Papa from 'papaparse';
import TennesseeMap from './src/components/TennesseeMap';
import careerPathwaysRaw from './src/data/career_pathways.json';

// --- Types ---
type MSACategory = 'Nashville' | 'Memphis' | 'Knoxville' | 'Chattanooga' | 'Other MSA' | 'Rural' | 'All';

interface DataRow {
  msa_category: string;
  NAICS2_NAME: string;
  n_weighted: number;
  n_weighted_low_wage: number;
  n_weighted_underemployed: number;
  n_weighted_stalled: number;
  education_level_label: string;
  soc_2019_5_acs_name: string;
  age_group: string;
}

type CohortType = 'Low Wage' | 'Underemployed' | 'Stalled' | 'All Stranded';

// Education levels in increasing order of credential (from the data)
const EDUCATION_ORDER = [
  'Less than HS',
  'HS diploma/GED',
  'Some college',
  "Associate's degree",
  "Bachelor's degree",
  "Master's degree",
  'Professional/Doctorate'
];

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55-64'];

// --- Career Pathways Data Types ---
interface TransitionRow {
  origin: string;
  destination: string;
  at_year_5: number;
  origin_share: number;
  a_median_origin: number;
  a_median_destination: number;
  share_stranded_origin: number;
  share_stranded_destination: number;
  share_part_time_origin: number;
  similarity: number;
  similarity_rating: string;
  wage_gain: number;
  wage_gain_pct: number;
  diff_strandedness: number;
}

interface SimilarityRow {
  origin: string;
  destination: string;
  a_median_origin: number;
  a_median_destination: number;
  share_stranded_origin: number;
  share_stranded_destination: number;
  share_part_time_origin: number;
  similarity: number;
  similarity_rating: string;
  wage_gain: number;
  wage_gain_pct: number;
  diff_strandedness: number;
}

interface SkillGapRow {
  origin: string;
  destination: string;
  skill: string;
  gap: number;
  importance: number;
}

interface CareerPathwaysData {
  transitions: TransitionRow[];
  similarity: SimilarityRow[];
  skills: SkillGapRow[];
}

const careerPathways = careerPathwaysRaw as CareerPathwaysData;

const pluralize = (name: string): string =>
  name.endsWith('s') ? name : name + 's';

// --- Load Real Data ---
const loadCSVData = async (): Promise<DataRow[]> => {
  try {
    const response = await fetch('/cross_tabulated_data_cleaned_correct.csv');
    const csvText = await response.text();

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const mappedData = (results.data as any[]).map((row: any) => ({
            msa_category: row.msa_category || '',
            NAICS2_NAME: row.naics2_title || 'Other',
            n_weighted: Number(row.n_weighted) || 0,
            n_weighted_low_wage: Number(row.n_low_wage_weighted) || 0,
            n_weighted_underemployed: Number(row.n_underemployed_weighted) || 0,
            n_weighted_stalled: Number(row.n_stranded_weighted) || 0,
            education_level_label: row.education_level_label || 'Unknown',
            soc_2019_5_acs_name: row.SOC_2019_5_ACS_NAME || 'Other',
            age_group: row.age_group || ''
          }));
          resolve(mappedData);
        }
      });
    });
  } catch (error) {
    console.error('Error loading CSV data:', error);
    return [];
  }
};

// --- Stalled Workers Data ---
interface StalledRow {
  msa_category: string;
  naics2_title: string;
  soc2_name: string;
  soc_2019_5_acs_name: string;
  n_career_stalled_weighted: number;
  tenure_years: number;
}

const loadStalledData = async (): Promise<StalledRow[]> => {
  try {
    const response = await fetch('/stalled_workers.csv');
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve((results.data as any[]).map((r: any) => ({
            msa_category: r.msa_category || '',
            naics2_title: r.naics2_title || '',
            soc2_name: r.soc2_name || '',
            soc_2019_5_acs_name: r.soc_2019_5_acs_name || '',
            n_career_stalled_weighted: Number(r.n_career_stalled_weighted) || 0,
            tenure_years: Number(r.tenure_years) || 0,
          })));
        }
      });
    });
  } catch (error) {
    console.error('Error loading stalled data:', error);
    return [];
  }
};

const TENURE_BUCKETS: [string, number, number][] = [
  ['3-4 yrs', 3,   4],
  ['4-5 yrs', 4,   5],
  ['5-7 yrs', 5,   7],
  ['7-10 yrs', 7, 10],
  ['10+ yrs', 10, Infinity],
];

// --- Components ---

const ProgressBar: React.FC<{ label: string, value: number, max: number, colorClass: string }> = ({ label, value, max, colorClass }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight text-slate-500">
      <span className="truncate pr-2">{label}</span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
    </div>
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full transition-all duration-1000 ${colorClass}`}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
      />
    </div>
  </div>
);

const Tooltip: React.FC<{ children: React.ReactNode; content: string; title: string }> = ({ children, content, title }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute z-50 w-72 p-4 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 -top-2 left-full ml-4 pointer-events-none">
          <div className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">{title}</div>
          <div className="text-xs leading-relaxed">{content}</div>
          <div className="absolute top-4 -left-2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-slate-900"></div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [geography, setGeography] = useState<MSACategory>('All');
  const [sector, setSector] = useState<string>('Manufacturing');
  const [selectedCohort, setSelectedCohort] = useState<CohortType>('All Stranded');
  const [targetOccupation, setTargetOccupation] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(0);
  const [rawData, setRawData] = useState<DataRow[]>([]);
  const [stalledData, setStalledData] = useState<StalledRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pathwayMode, setPathwayMode] = useState<'transitions' | 'similarity'>('transitions');
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    Promise.all([loadCSVData(), loadStalledData()]).then(([data, stalled]) => {
      setRawData(data);
      setStalledData(stalled);
      setIsLoading(false);
    });
  }, []);

  const sectors = useMemo(() => {
    const allSectors = Array.from(new Set(rawData.map(d => d.NAICS2_NAME).filter(s => s && s !== 'Other' && s !== 'NA')));
    return allSectors.sort();
  }, [rawData]);

  const filteredByScope = useMemo(() =>
    rawData.filter(d => (geography === 'All' || d.msa_category === geography) && d.NAICS2_NAME === sector),
  [rawData, geography, sector]);

  const stalledByScope = useMemo(() =>
    stalledData.filter(d =>
      (geography === 'All' || d.msa_category === geography) &&
      d.naics2_title === sector
    ),
    [stalledData, geography, sector]
  );

  const stats = useMemo(() => {
    let lw = 0, ue = 0, st = 0, total = 0;
    filteredByScope.forEach(d => {
      total += d.n_weighted;
      lw += d.n_weighted_low_wage;
      ue += d.n_weighted_underemployed;
    });
    st = stalledByScope.reduce((sum, d) => sum + d.n_career_stalled_weighted, 0);
    return { total, lw, ue, st };
  }, [filteredByScope, stalledByScope]);

  const cohortBreakdowns = useMemo(() => {
    const edu: Record<string, number> = {};
    const age: Record<string, number> = {};
    const occ: Record<string, number> = {};

    filteredByScope.forEach(d => {
      let weight = 0;
      if (selectedCohort === 'Low Wage') weight = d.n_weighted_low_wage;
      else if (selectedCohort === 'Underemployed') weight = d.n_weighted_underemployed;
      else if (selectedCohort === 'Stalled') weight = d.n_weighted_stalled;
      else weight = d.n_weighted_low_wage + d.n_weighted_underemployed + d.n_weighted_stalled;

      edu[d.education_level_label] = (edu[d.education_level_label] || 0) + weight;
      age[d.age_group] = (age[d.age_group] || 0) + weight;
      occ[d.soc_2019_5_acs_name] = (occ[d.soc_2019_5_acs_name] || 0) + weight;
    });

    return {
      edu: (Object.entries(edu).sort((a,b) => EDUCATION_ORDER.indexOf(a[0]) - EDUCATION_ORDER.indexOf(b[0]))) as [string, number][],
      age: (Object.entries(age).sort((a,b) => AGE_GROUPS.indexOf(a[0]) - AGE_GROUPS.indexOf(b[0]))) as [string, number][],
      occ: (Object.entries(occ).sort((a,b) => b[1] - a[1]).filter(([, val]) => val > 0)) as [string, number][]
    };
  }, [filteredByScope, selectedCohort]);

  const stalledBreakdowns = useMemo(() => {
    const occMix: Record<string, number> = {};
    const durations: Record<string, number> = Object.fromEntries(TENURE_BUCKETS.map(([l]) => [l, 0]));

    stalledByScope.forEach(d => {
      occMix[d.soc_2019_5_acs_name] = (occMix[d.soc_2019_5_acs_name] || 0) + d.n_career_stalled_weighted;
      const bucket = TENURE_BUCKETS.find(([, lo, hi]) => d.tenure_years >= lo && d.tenure_years < hi);
      if (bucket) durations[bucket[0]] += d.n_career_stalled_weighted;
    });

    return {
      occMix: Object.entries(occMix).sort((a, b) => b[1] - a[1]) as [string, number][],
      durations: TENURE_BUCKETS.map(([label]) => [label, durations[label]]) as [string, number][],
    };
  }, [stalledByScope]);

  useEffect(() => {
    if (cohortBreakdowns.occ.length > 0) {
      // Always reset to top occupation when sector, cohort, or data changes
      setTargetOccupation(cohortBreakdowns.occ[0][0]);
    }
  }, [sector, selectedCohort, geography, cohortBreakdowns.occ]);

  // Reset destination when occupation changes
  useEffect(() => {
    setSelectedDestination(null);
    setExpandedRec(null);
  }, [targetOccupation, pathwayMode]);

  // --- Section 03: Occupation diagnostics from career pathways data ---
  const occupationDiagnostics = useMemo(() => {
    if (!targetOccupation) return null;
    // Look up from transitions first, fall back to similarity
    const transRow = careerPathways.transitions.find(r => r.origin === targetOccupation);
    const simRow = careerPathways.similarity.find(r => r.origin === targetOccupation);
    const row = transRow || simRow;
    if (!row) return null;
    return {
      strandedShare: row.share_stranded_origin,
      medianWage: row.a_median_origin,
      partTimeShare: row.share_part_time_origin,
    };
  }, [targetOccupation]);

  // --- Section 04: Pathway destinations ---
  const destinationPathways = useMemo(() => {
    if (!targetOccupation) return [];
    if (pathwayMode === 'transitions') {
      const transResults = careerPathways.transitions
        .filter(r => r.origin === targetOccupation)
        .sort((a, b) => b.at_year_5 - a.at_year_5)
        .slice(0, 5);
      // If no transitions found, fall back to similarity with a flag
      if (transResults.length === 0) {
        return careerPathways.similarity
          .filter(r => r.origin === targetOccupation)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)
          .map(r => ({ ...r, at_year_5: 0, _fallback: true } as TransitionRow & { _fallback?: boolean }));
      }
      return transResults;
    } else {
      return careerPathways.similarity
        .filter(r => r.origin === targetOccupation)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(r => ({ ...r, at_year_5: 0 } as TransitionRow));
    }
  }, [targetOccupation, pathwayMode]);

  const isTransitionFallback = pathwayMode === 'transitions' && destinationPathways.length > 0 && (destinationPathways[0] as any)?._fallback;

  // --- Section 04: Skill gaps for selected origin -> destination ---
  const selectedSkillGaps = useMemo(() => {
    if (!targetOccupation || !selectedDestination) return [];
    return careerPathways.skills
      .filter(r => r.origin === targetOccupation && r.destination === selectedDestination && r.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 10);
  }, [targetOccupation, selectedDestination]);

  // --- Section 04: Credential-related skills ---
  const credentialSkills = useMemo(() => {
    const credentialKeywords = ['Licens', 'Certif', 'Degree', 'CPA', 'RN', 'CDL', 'OSHA', 'Board', 'Accredit', 'Registr'];
    return selectedSkillGaps.filter(s =>
      credentialKeywords.some(kw => s.skill.toLowerCase().includes(kw.toLowerCase()))
    );
  }, [selectedSkillGaps]);

  // --- Section 04: Cross-pathway skill acquisition ---
  const crossPathwaySkills = useMemo(() => {
    if (!targetOccupation) return [];
    // Get all destinations from both transitions and similarity for this origin
    const allTransDests = careerPathways.transitions.filter(r => r.origin === targetOccupation).map(r => r.destination);
    const allSimDests = careerPathways.similarity.filter(r => r.origin === targetOccupation).map(r => r.destination);
    const allDests = Array.from(new Set([...allTransDests, ...allSimDests]));
    const totalDestCount = allDests.length;

    // Get all skill gaps for this origin across all destinations
    // Filter for meaningful skills: importance > 0.005 and gap > 0.005
    const allSkillGaps = careerPathways.skills.filter(
      r => r.origin === targetOccupation && r.gap > 0.005 && r.importance > 0.005 && allDests.includes(r.destination)
    );

    // Count how many destinations each skill appears in, and track max importance
    const skillMap: Record<string, { count: number; maxImportance: number }> = {};
    allSkillGaps.forEach(s => {
      if (!skillMap[s.skill]) {
        skillMap[s.skill] = { count: 0, maxImportance: 0 };
      }
      skillMap[s.skill].count++;
      skillMap[s.skill].maxImportance = Math.max(skillMap[s.skill].maxImportance, s.importance);
    });

    // Require appearing in at least 2 pathways to qualify as "cross-pathway"
    return Object.entries(skillMap)
      .filter(([, data]) => data.count >= 2)
      .sort((a, b) => b[1].count - a[1].count || b[1].maxImportance - a[1].maxImportance)
      .slice(0, 5)
      .map(([skill, data]) => ({ skill, count: data.count, totalDests: totalDestCount, importance: data.maxImportance }));
  }, [targetOccupation]);

  // --- Selected destination row ---
  const selectedDestRow = useMemo(() => {
    if (!selectedDestination || !targetOccupation) return null;
    const transRow = careerPathways.transitions.find(
      r => r.origin === targetOccupation && r.destination === selectedDestination
    );
    const simRow = careerPathways.similarity.find(
      r => r.origin === targetOccupation && r.destination === selectedDestination
    );
    return transRow || simRow || null;
  }, [targetOccupation, selectedDestination]);

  const handleExportBrief = () => {
    const renderReportBar = (label: string, value: number, max: number, color: string = '#1e3a8a') => `
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">
          <span>${label}</span>
          <span>${value.toLocaleString()}</span>
        </div>
        <div style="height: 8px; width: 100%; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; width: ${max > 0 ? (value / max) * 100 : 0}%; background: ${color}; border-radius: 4px;"></div>
        </div>
      </div>
    `;

    const maxAge = Math.max(...cohortBreakdowns.age.map(x => x[1]));
    const maxEdu = Math.max(...cohortBreakdowns.edu.map(x => x[1]));
    const maxOcc = Math.max(...cohortBreakdowns.occ.map(x => x[1]));

    const reportHtml = `
      <html>
        <head>
          <title>Executive Brief: Stranded Talent Strategy</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
            * { box-sizing: border-box; }
            body { font-family: 'Inter', sans-serif; padding: 0; margin: 0; color: #1e293b; background: #fff; }
            .page {
              padding: 60px 70px 100px 70px;
              min-height: 100vh;
              page-break-after: always;
              position: relative;
            }
            .header {
              border-bottom: 4px solid #1e3a8a;
              padding-bottom: 20px;
              margin-bottom: 35px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .header h1 {
              margin: 0;
              text-transform: uppercase;
              font-size: 24px;
              color: #1e3a8a;
              font-weight: 800;
              letter-spacing: -0.025em;
            }
            .header .meta {
              text-align: right;
              font-size: 10px;
              color: #64748b;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              line-height: 1.8;
            }
            h2 {
              color: #1e3a8a;
              border-left: 6px solid #f59e0b;
              padding-left: 12px;
              text-transform: uppercase;
              font-size: 14px;
              margin-top: 0;
              margin-bottom: 18px;
              font-weight: 800;
            }
            .stat-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 28px;
            }
            .stat-box {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              padding: 20px;
              border-radius: 12px;
              text-align: center;
            }
            .stat-val {
              font-size: 28px;
              font-weight: 800;
              color: #1e40af;
              display: block;
              letter-spacing: -0.05em;
            }
            .stat-label {
              font-size: 9px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              display: block;
              margin-bottom: 8px;
            }
            .content-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 35px;
            }
            .rec-card {
              background: #1e3a8a;
              color: white;
              padding: 28px;
              border-radius: 16px;
              margin-bottom: 18px;
              page-break-inside: avoid;
            }
            .rec-card h3 {
              color: #f59e0b;
              margin: 0 0 10px 0;
              text-transform: uppercase;
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.1em;
            }
            .rec-title {
              font-size: 16px;
              font-weight: 800;
              margin: 0 0 12px 0;
              color: #fef3c7;
            }
            .rec-advice {
              font-size: 13px;
              line-height: 1.6;
              margin: 0;
              color: #e2e8f0;
              font-weight: 400;
            }
            .footer {
              position: absolute;
              bottom: 40px;
              left: 70px;
              right: 70px;
              border-top: 1px solid #e2e8f0;
              padding-top: 12px;
              font-size: 8px;
              color: #94a3b8;
              text-align: center;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.2em;
            }
            .section-divider {
              margin-top: 35px;
              margin-bottom: 25px;
            }
            @media print {
              .page {
                min-height: 100vh;
                height: auto;
              }
              .rec-card {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em;">Phase I: Diagnostic Inventory</p>
                <h1>Stranded Talent Analysis</h1>
              </div>
              <div class="meta">
                Region: ${geography === 'All' ? 'All Tennessee' : geography + ' MSA'}<br>
                Industry: ${sector}<br>
                Briefing Date: ${new Date().toLocaleDateString()}
              </div>
            </div>

            <div class="stat-grid">
              <div class="stat-box">
                <span class="stat-label">Total Scope</span>
                <span class="stat-val">${stats.total.toLocaleString()}</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">Low Wage</span>
                <span class="stat-val">${stats.lw.toLocaleString()}</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">Underemployed</span>
                <span class="stat-val">${stats.ue.toLocaleString()}</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">Stalled</span>
                <span class="stat-val">${Math.round(stats.st).toLocaleString()}</span>
              </div>
            </div>

            <div class="content-grid">
              <div>
                <h2>Demographic Profile: ${selectedCohort}</h2>
                <div style="margin-bottom: 32px;">
                  <h3 style="font-size: 11px; text-transform: uppercase; color: #1e3a8a; margin-bottom: 14px; font-weight: 800; margin-top: 0;">Age Distribution</h3>
                  ${cohortBreakdowns.age.map(([label, val]) => renderReportBar(label, val, maxAge)).join('')}
                </div>
                <div>
                  <h3 style="font-size: 11px; text-transform: uppercase; color: #1e3a8a; margin-bottom: 14px; font-weight: 800; margin-top: 0;">Education Pipeline</h3>
                  ${cohortBreakdowns.edu.map(([label, val]) => renderReportBar(label, val, maxEdu, '#f59e0b')).join('')}
                </div>
              </div>
              <div>
                <h2>Occupational Distribution</h2>
                <p style="font-size: 11px; color: #64748b; margin: 0 0 18px 0; text-transform: uppercase; font-weight: 800;">Primary Target Nodes</p>
                ${cohortBreakdowns.occ.slice(0, 10).map(([label, val]) => renderReportBar(label, val, maxOcc, '#10b981')).join('')}
              </div>
            </div>

            <div class="footer">Tennessee BGI Strategic Workforce Initiative | Executive Confidential</div>
          </div>

          <div class="page">
            <div class="header">
              <div>
                <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em;">Phase II: Career Pathways</p>
                <h1>Destination Analysis</h1>
              </div>
              <div class="meta">
                Focus Occupation: ${targetOccupation}<br>
                Target Cohort: ${selectedCohort}
              </div>
            </div>

            <p style="font-size: 13px; line-height: 1.6; color: #334155; margin: 0 0 30px 0;">
              Career pathway analysis for <strong>${targetOccupation}</strong> within <strong>${geography === 'All' ? 'Tennessee' : geography}</strong>. Top destination occupations identified through observed transitions and skill similarity scoring.
            </p>

            ${destinationPathways.map((p, i) => `
              <div class="rec-card">
                <h3>Destination ${String(i + 1).padStart(2, '0')}</h3>
                <p class="rec-title">${p.destination}</p>
                <p class="rec-advice">Wage Gain: +$${p.wage_gain.toLocaleString()} (${Math.round(p.wage_gain_pct * 100)}%) | Similarity: ${Math.round(p.similarity * 100)}% | Strandedness Change: ${Math.round(p.diff_strandedness * 100)}%</p>
              </div>
            `).join('')}

            <div class="footer">Tennessee BGI Strategic Workforce Initiative | Executive Confidential</div>
          </div>

          <script>window.print();</script>
        </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win?.document.write(reportHtml);
    win?.document.close();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-blue-900 border-t-transparent"></div>
          <p className="mt-4 text-slate-600 font-bold">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 font-['Inter']">
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
        <button
          onClick={handleExportBrief}
          className="flex items-center gap-2 md:gap-3 bg-white hover:bg-slate-100 text-blue-950 px-4 py-2 md:px-8 md:py-3 rounded-2xl font-black text-xs uppercase transition-all shadow-xl active:scale-95 group w-full md:w-auto justify-center"
        >
          <Download size={16} className="md:w-[18px] md:h-[18px] group-hover:translate-y-0.5 transition-transform" /> <span className="hidden sm:inline">Export Executive Brief</span><span className="sm:hidden">Export Brief</span>
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-10 py-8 md:py-12 space-y-12 md:space-y-24">

        {/* Step 1: Selection */}
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
                <TennesseeMap
                  selectedRegion={geography}
                  onRegionClick={setGeography}
                />
              </div>
            </div>
            <div className="col-span-12 lg:col-span-5 flex flex-col justify-center gap-6">
              <div className="bg-white p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                  <Briefcase size={14} className="text-blue-500" /> NAICS Sector
                </label>
                <div className="relative">
                  <select
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-[24px] px-8 py-5 text-sm font-black appearance-none focus:border-blue-500 transition-all outline-none pr-16"
                  >
                    {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                    <ChevronDown size={24} />
                  </div>
                </div>
                <div className="mt-8 md:mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="p-5 md:p-6 bg-blue-900 rounded-[24px] md:rounded-[32px] text-white">
                    <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-2">Total Workers</p>
                    <p className="text-2xl md:text-3xl font-black">{stats.total.toLocaleString()}</p>
                  </div>
                  <div className="p-5 md:p-6 bg-amber-500 rounded-[24px] md:rounded-[32px] text-blue-950">
                    <p className="text-[10px] font-black text-blue-950/40 uppercase tracking-widest mb-2">Stranded Rate</p>
                    <p className="text-2xl md:text-3xl font-black">{((stats.lw / stats.total) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2: Landscape */}
        <section className="space-y-6 md:space-y-10">
          <div className="flex items-center gap-3 md:gap-4 border-b-2 border-slate-200 pb-4 md:pb-6">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs md:text-sm shadow-inner flex-shrink-0">02</div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 uppercase tracking-tight leading-none">The Stranded Landscape</h2>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-2">Cohort Identification & Intersection</p>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-6 bg-white p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200 flex items-center justify-center">
              <div className="relative w-64 h-64 sm:w-80 sm:h-80">
                <div
                  onClick={() => setSelectedCohort('Low Wage')}
                  onMouseEnter={(e) => e.currentTarget.dataset.tooltip = 'show'}
                  onMouseLeave={(e) => e.currentTarget.dataset.tooltip = 'hide'}
                  className={`absolute w-40 h-40 sm:w-52 sm:h-52 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center top-0 left-0 hover:z-30 group ${
                    selectedCohort === 'Low Wage' ? 'bg-blue-600/40 border-blue-600 z-20 scale-105 shadow-xl' : 'bg-blue-500/5 border-blue-200 opacity-60'
                  }`}
                >
                  <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-widest absolute -top-6 sm:-top-8 ${selectedCohort === 'Low Wage' ? 'text-blue-900' : 'text-slate-400'}`}>Low Wage</span>
                  <span className={`text-xl sm:text-2xl font-black ${selectedCohort === 'Low Wage' ? 'text-blue-900' : 'text-slate-400'} absolute top-12 sm:top-16 left-6 sm:left-8`}>{stats.lw.toLocaleString()}</span>
                  <div className="invisible group-hover:visible absolute z-50 w-72 p-4 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 top-1/2 -translate-y-1/2 left-full ml-4 pointer-events-none">
                    <div className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">Low Wage Workers</div>
                    <div className="text-xs leading-relaxed">Workers earning annual wages below $30,493 (two-thirds of MIT Living Wage for Tennessee). These workers struggle to meet basic living expenses despite being employed full-time.</div>
                    <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-slate-900"></div>
                  </div>
                </div>
                <div
                  onClick={() => setSelectedCohort('Underemployed')}
                  className={`absolute w-40 h-40 sm:w-52 sm:h-52 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center top-0 right-0 hover:z-30 group ${
                    selectedCohort === 'Underemployed' ? 'bg-amber-500/40 border-amber-600 z-20 scale-105 shadow-xl' : 'bg-amber-500/5 border-amber-200 opacity-60'
                  }`}
                >
                  <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-widest absolute -top-6 sm:-top-8 ${selectedCohort === 'Underemployed' ? 'text-amber-900' : 'text-slate-400'}`}>Underemployed</span>
                  <span className={`text-xl sm:text-2xl font-black ${selectedCohort === 'Underemployed' ? 'text-amber-900' : 'text-slate-400'} absolute top-12 sm:top-16 right-6 sm:right-8`}>{stats.ue.toLocaleString()}</span>
                  <div className="invisible group-hover:visible absolute z-50 w-72 p-4 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 top-1/2 -translate-y-1/2 right-full mr-4 pointer-events-none">
                    <div className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">Underemployed Workers</div>
                    <div className="text-xs leading-relaxed">Workers whose education level exceeds the typical requirements for their occupation by at least 2 levels (for Associate's or below) or 1 level (for Bachelor's or above), AND earn $45,739 or less annually (MIT Living Wage ceiling). These workers have credentials that aren't being fully utilized.</div>
                    <div className="absolute top-1/2 -translate-y-1/2 -right-2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-8 border-l-slate-900"></div>
                  </div>
                </div>
                <div
                  onClick={() => setSelectedCohort('Stalled')}
                  className={`absolute w-40 h-40 sm:w-52 sm:h-52 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center bottom-0 left-1/2 -translate-x-1/2 hover:z-30 group ${
                    selectedCohort === 'Stalled' ? 'bg-emerald-500/40 border-emerald-600 z-20 scale-105 shadow-xl' : 'bg-emerald-500/5 border-emerald-200 opacity-60'
                  }`}
                >
                  <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-widest absolute -bottom-6 sm:-bottom-8 ${selectedCohort === 'Stalled' ? 'text-emerald-900' : 'text-slate-400'}`}>Stalled</span>
                  <span className={`text-xl sm:text-2xl font-black ${selectedCohort === 'Stalled' ? 'text-emerald-900' : 'text-slate-400'} absolute bottom-12 sm:bottom-16`}>{Math.round(stats.st).toLocaleString()}</span>
                  <div className="invisible group-hover:visible absolute z-50 w-72 p-4 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 bottom-full mb-4 left-1/2 -translate-x-1/2 pointer-events-none">
                    <div className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">Stalled Workers</div>
                    <div className="text-xs leading-relaxed">Workers who have remained in the same low-wage job for 3 or more years without meaningful wage progression. These workers are economically stuck — employed, but unable to advance their careers or earnings.</div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-slate-900"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-6 bg-white p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 md:mb-10">Diagnostics: {selectedCohort}</h4>
              {selectedCohort === 'Stalled' ? (
                <>
                  {/* Occupational Mix of Stalled Talent */}
                  <div className="space-y-6">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Briefcase size={14} className="text-emerald-500"/> Occupational Mix</p>
                    <div className="space-y-5">
                      {stalledBreakdowns.occMix.length > 0
                        ? stalledBreakdowns.occMix.slice(0, 6).map(([label, val]) => (
                            <ProgressBar key={label} label={label} value={Math.round(val)} max={Math.round(stalledBreakdowns.occMix[0][1])} colorClass="bg-emerald-500" />
                          ))
                        : <p className="text-xs text-slate-400 italic">No stalled workers in this selection.</p>
                      }
                    </div>
                  </div>
                  {/* Stall Duration Distribution */}
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
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-12">
                    <div className="space-y-6">
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Users size={14} className="text-blue-500"/> Age Profile</p>
                      <div className="space-y-5">
                        {cohortBreakdowns.age.map(([label, val]) => (
                          <ProgressBar key={label} label={label} value={val} max={Math.max(...cohortBreakdowns.age.map(x => x[1]))} colorClass="bg-blue-600" />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><GraduationCap size={14} className="text-amber-500"/> Edu Level</p>
                      <div className="space-y-5">
                        {cohortBreakdowns.edu.map(([label, val]) => (
                          <ProgressBar key={label} label={label} value={val} max={Math.max(...cohortBreakdowns.edu.map(x => x[1]))} colorClass="bg-amber-500" />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 md:mt-12 pt-8 md:pt-10 border-t border-slate-100">
                    <p className="text-[10px] md:text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 md:mb-6 flex items-center gap-2"><BarChart3 size={14} className="text-emerald-500"/> <span className="hidden sm:inline">Occupations with Most Stranded Workers</span><span className="sm:hidden">Top Occupations</span></p>
                    <div className="space-y-4">
                      {cohortBreakdowns.occ.slice(0, 4).map(([label, val]) => (
                        <ProgressBar key={label} label={label} value={val} max={Math.max(...cohortBreakdowns.occ.map(x => x[1]))} colorClass="bg-emerald-500" />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Step 3: Occupational Selection */}
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
                <div
                  key={occ}
                  onClick={() => setTargetOccupation(occ)}
                  className={`p-5 md:p-6 rounded-[24px] md:rounded-[32px] border-2 cursor-pointer transition-all duration-300 ${
                    targetOccupation === occ ? 'bg-blue-900 border-blue-900 shadow-xl -translate-y-1' : 'bg-white border-slate-100 hover:border-blue-300'
                  }`}
                >
                  <p className={`font-black uppercase tracking-tighter text-xs md:text-sm mb-3 md:mb-4 truncate ${targetOccupation === occ ? 'text-blue-200' : 'text-slate-800'}`}>{occ}</p>
                  <div className="flex justify-between items-center">
                    <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest ${targetOccupation === occ ? 'text-blue-400' : 'text-slate-400'}`}>
                      {selectedCohort === 'All Stranded' ? 'Stranded Workers' : `${selectedCohort} Workers`}
                    </span>
                    <span className={`text-base md:text-lg font-black ${targetOccupation === occ ? 'text-white' : 'text-blue-950'}`}>{val.toLocaleString()}</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
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
                      Share of workers in this occupation working part-time, among those working at least 15 hours per week.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Step 4: Policy Roadmap — Career Pathways */}
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
              <button
                onClick={() => setPathwayMode('transitions')}
                className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-wider transition-all ${
                  pathwayMode === 'transitions'
                    ? 'bg-blue-900 text-white shadow-lg'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Historically Common Transitions
              </button>
              <button
                onClick={() => setPathwayMode('similarity')}
                className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full text-[10px] md:text-xs font-black uppercase tracking-wider transition-all ${
                  pathwayMode === 'similarity'
                    ? 'bg-blue-900 text-white shadow-lg'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
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
                    const wagePct = Math.round(p.wage_gain_pct * 100);
                    const strandPct = Math.round(p.diff_strandedness * 100);
                    const isSelected = selectedDestination === p.destination;
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedDestination(p.destination)}
                        className={`p-4 md:p-5 rounded-2xl md:rounded-3xl border-2 cursor-pointer transition-all duration-300 ${
                          isSelected
                            ? 'bg-blue-900 border-blue-900 shadow-xl -translate-y-1'
                            : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-sm'
                        }`}
                      >
                        <p className={`text-xs md:text-sm font-black leading-snug mb-3 ${isSelected ? 'text-blue-200' : 'text-slate-800'}`}>{p.destination}</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Wage Gain</span>
                            <span className={`text-[11px] md:text-xs font-black ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`}>
                              +${p.wage_gain.toLocaleString()} ({wagePct > 0 ? `+${wagePct}` : wagePct}%)
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Strandedness</span>
                            <span className={`text-[11px] md:text-xs font-black ${strandPct < 0 ? (isSelected ? 'text-emerald-300' : 'text-emerald-600') : (isSelected ? 'text-red-300' : 'text-red-500')}`}>
                              {strandPct < 0 ? `${strandPct}%` : `+${strandPct}%`}
                            </span>
                          </div>
                          {pathwayMode === 'transitions' && p.at_year_5 > 0 && (
                            <div className="flex items-center justify-between">
                              <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Observed</span>
                              <span className={`text-[11px] md:text-xs font-black ${isSelected ? 'text-white' : 'text-slate-700'}`}>{p.at_year_5} workers</span>
                            </div>
                          )}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>Similarity</span>
                              <span className={`text-[10px] font-bold ${isSelected ? 'text-blue-300' : 'text-slate-500'}`}>{Math.round(p.similarity * 100)}%</span>
                            </div>
                            <div className={`w-full h-1.5 rounded-full overflow-hidden ${isSelected ? 'bg-blue-800' : 'bg-slate-100'}`}>
                              <div className={`h-full rounded-full ${isSelected ? 'bg-amber-400' : 'bg-amber-400'}`} style={{ width: `${Math.round(p.similarity * 100)}%` }} />
                            </div>
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

          {/* 4c. Strategy Recommendations (when destination is selected) */}
          {targetOccupation && selectedDestination && selectedDestRow && (
            <div className="grid grid-cols-12 gap-10">
              <div className="col-span-12 lg:col-span-7 space-y-4 md:space-y-6">

                {/* Strategy 1: Career Advancement Pathways (Skill Gaps) */}
                <div
                  onClick={() => setExpandedRec(expandedRec === 0 ? null : 0)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 0 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <BarChart3 size={18} className={expandedRec === 0 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 0 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Career Advancement Pathways</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 0 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 0 && (
                    <div className="mt-6 md:mt-8 animate-in fade-in slide-in-from-top-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Key Skills to Develop: {targetOccupation} &rarr; {selectedDestination}</p>
                      {selectedSkillGaps.length > 0 ? (
                        <div className="space-y-3">
                          {selectedSkillGaps.map((s, i) => {
                            const maxGap = selectedSkillGaps[0].gap;
                            const pctGap = Math.round(s.gap * 100);
                            return (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                  <span className="truncate pr-2">{s.skill}</span>
                                  <span className="tabular-nums text-blue-600">{pctGap}% gap</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full transition-all duration-700"
                                    style={{ width: `${maxGap > 0 ? (s.gap / maxGap) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No skill gap data available for this transition.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Strategy 2: Credentials & Licensing */}
                <div
                  onClick={() => setExpandedRec(expandedRec === 1 ? null : 1)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 1 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <GraduationCap size={18} className={expandedRec === 1 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 1 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Credentials & Licensing</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 1 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 1 && (
                    <div className="mt-6 md:mt-8 animate-in fade-in slide-in-from-top-4">
                      {credentialSkills.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-600 font-medium mb-4">The following credential-related skills were identified as gaps for this transition:</p>
                          {credentialSkills.map((s, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                              <FileText size={14} className="text-amber-600 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-black text-slate-800">{s.skill}</p>
                                <p className="text-[10px] text-slate-500">{Math.round(s.gap * 100)}% skill gap | {Math.round(s.importance * 100)}% importance in destination</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-sm text-slate-600 font-medium">No specific credential or licensing requirements were identified in the skill gap analysis for this transition.</p>
                          <p className="text-xs text-slate-400 mt-2">We recommend checking Tennessee state licensing boards and industry certification bodies for occupation-specific requirements for {selectedDestination}.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Strategy 3: Employer Mobility Within Occupation */}
                <div
                  onClick={() => setExpandedRec(expandedRec === 2 ? null : 2)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 2 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Briefcase size={18} className={expandedRec === 2 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 2 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Employer Mobility Within Occupation</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 2 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 2 && (
                    <div className="mt-6 md:mt-8 animate-in fade-in slide-in-from-top-4">
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
                <div
                  onClick={() => setExpandedRec(expandedRec === 3 ? null : 3)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === 3 ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Layers size={18} className={expandedRec === 3 ? 'text-blue-600' : 'text-slate-300'} />
                      <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === 3 ? 'text-blue-900' : 'text-slate-500'}`}>Strategy: Cross-Pathway Skill Acquisition</h3>
                    </div>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === 3 ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === 3 && (
                    <div className="mt-6 md:mt-8 animate-in fade-in slide-in-from-top-4">
                      <p className="text-sm text-slate-600 font-medium mb-4">
                        Skills that appear as gaps across multiple destination pathways for {pluralize(targetOccupation)}. Investing in these skills maximizes career flexibility.
                      </p>
                      {crossPathwaySkills.length > 0 ? (
                        <div className="space-y-3">
                          {crossPathwaySkills.map((s, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs flex-shrink-0">{i + 1}</div>
                                <div>
                                  <p className="text-sm font-black text-slate-800">{s.skill}</p>
                                  <p className="text-[10px] text-slate-400">{Math.round(s.importance * 100)}% importance score</p>
                                </div>
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
                      <div className="flex justify-between border-b border-white/10 pb-2 md:pb-3">
                        <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">Region</span>
                        <span className="font-bold text-xs md:text-sm">{geography}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/10 pb-2 md:pb-3">
                        <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">Sector</span>
                        <span className="font-bold text-xs md:text-sm truncate max-w-[150px] md:max-w-[200px]">{sector}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/10 pb-2 md:pb-3">
                        <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">Origin</span>
                        <span className="font-bold text-xs md:text-sm truncate max-w-[150px] md:max-w-[200px]">{targetOccupation}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/10 pb-2 md:pb-3">
                        <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">Destination</span>
                        <span className="font-bold text-xs md:text-sm truncate max-w-[150px] md:max-w-[200px] text-amber-400">{selectedDestination}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/10 pb-2 md:pb-3">
                        <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">Cohort</span>
                        <span className="font-bold text-xs md:text-sm">{selectedCohort}</span>
                      </div>
                    </div>

                    <div className="space-y-6 md:space-y-10">
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <TrendingUp size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Wage Gain</p>
                          <p className="text-2xl md:text-3xl font-black">+${selectedDestRow.wage_gain.toLocaleString()}</p>
                          <p className="text-[10px] text-blue-300 mt-1">
                            {Math.round(selectedDestRow.wage_gain_pct * 100)}% increase &bull; To ${selectedDestRow.a_median_destination.toLocaleString()}/yr
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
                            Destination stranded rate: {(selectedDestRow.share_stranded_destination * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <Layers size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Skill Similarity</p>
                          <p className="text-2xl md:text-3xl font-black">{Math.round(selectedDestRow.similarity * 100)}%</p>
                          <p className="text-[10px] text-blue-300 mt-1">
                            Rating: {selectedDestRow.similarity_rating}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:gap-8">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                          <Users size={24} className="md:w-7 md:h-7" />
                        </div>
                        <div>
                          <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Workers in Pool</p>
                          <p className="text-2xl md:text-3xl font-black">{(cohortBreakdowns.occ.find(d => d[0] === targetOccupation)?.[1] || 0).toLocaleString()}</p>
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
        <span className="text-center md:text-left">BGI Data Analytics © 2025 | Tennessee Strategic Workforce Dashboard</span>
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
