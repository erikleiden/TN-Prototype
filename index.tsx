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

// --- Load Real Data ---
const loadCSVData = async (): Promise<DataRow[]> => {
  try {
    const response = await fetch('/src/data/cross_tabulated_data_cleaned_correct.csv');
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
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load data on mount
  useEffect(() => {
    loadCSVData().then(data => {
      setRawData(data);
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

  const stats = useMemo(() => {
    let lw = 0, ue = 0, st = 0, total = 0;
    filteredByScope.forEach(d => {
      total += d.n_weighted;
      lw += d.n_weighted_low_wage;
      ue += d.n_weighted_underemployed;
      st += d.n_weighted_stalled;
    });
    return { total, lw, ue, st };
  }, [filteredByScope]);

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

  useEffect(() => {
    if (cohortBreakdowns.occ.length > 0 && !targetOccupation) {
      setTargetOccupation(cohortBreakdowns.occ[0][0]);
    }
  }, [cohortBreakdowns.occ, targetOccupation]);

  // Analyze cohort characteristics for dynamic recommendations
  const totalCohort = cohortBreakdowns.edu.reduce((sum, [, val]) => sum + val, 0);

  // Age analysis
  const youngCount = cohortBreakdowns.age.filter(([label]) => label === '18-24' || label === '25-34').reduce((sum, [, val]) => sum + val, 0);
  const matureCount = cohortBreakdowns.age.filter(([label]) => label === '45-54' || label === '55-64').reduce((sum, [, val]) => sum + val, 0);
  const isYoungCohort = youngCount / totalCohort > 0.5;
  const isMatureCohort = matureCount / totalCohort > 0.5;

  // Education analysis
  const lowEduCount = cohortBreakdowns.edu.filter(([label]) => label === 'Less than HS' || label === 'HS diploma/GED').reduce((sum, [, val]) => sum + val, 0);
  const highEduCount = cohortBreakdowns.edu.filter(([label]) => label === "Bachelor's degree" || label === 'Graduate degree').reduce((sum, [, val]) => sum + val, 0);
  const someCollegeCount = cohortBreakdowns.edu.find(([label]) => label === 'Some college')?.[1] || 0;
  const isLowEducation = lowEduCount / totalCohort > 0.6;
  const isHighEducation = highEduCount / totalCohort > 0.4;
  const hasSomeCollege = someCollegeCount / totalCohort > 0.15;

  // Sector-specific characteristics
  const isManufacturing = sector.includes('Manufacturing');
  const isHealthcare = sector.includes('Health');
  const isRetail = sector.includes('Retail') || sector.includes('Food');
  const isConstruction = sector.includes('Construction');
  const isProfessional = sector.includes('Professional') || sector.includes('Finance') || sector.includes('Information');
  const isEducation = sector.includes('Educational');

  // Build dynamic recommendations based on cohort profile
  const recommendations: { title: string; advice: string }[] = [];

  // Recommendation 1: Age-appropriate entry strategy
  if (isYoungCohort) {
    recommendations.push({
      title: "Strategy: Youth Apprenticeship & Pre-Apprenticeship Programs",
      advice: `With over half of ${targetOccupation}s in ${geography === 'All' ? 'Tennessee' : geography} under age 35, registered apprenticeship programs offer a proven pathway. Partner with ${sector} employers to create earn-while-you-learn pathways that combine on-the-job training with classroom instruction. Tennessee Reconnect and Drive to 55 initiatives provide tuition support for participants under 25, enabling credential attainment while earning competitive wages.`
    });
  } else if (isMatureCohort) {
    recommendations.push({
      title: "Strategy: Mid-Career Upskilling & Re-Credentialing",
      advice: `Many ${targetOccupation}s in this cohort (45+) have extensive work experience but lack formal credentials. Implement Prior Learning Assessment (PLA) programs that award college credit for work experience, combined with accelerated competency-based education to fast-track credential completion. Tennessee Reconnect offers tuition-free community college for adults, making this financially viable.`
    });
  } else {
    recommendations.push({
      title: "Strategy: Career Advancement Pathways",
      advice: `Focus on creating clear advancement pathways for mid-career ${targetOccupation}s in ${sector}. Develop stackable credentials that allow workers to incrementally build skills while remaining employed. Partner with employers to create internal promotion pathways that recognize credential attainment with wage increases.`
    });
  }

  // Recommendation 2: Education-appropriate intervention
  if (isLowEducation) {
    recommendations.push({
      title: "Strategy: Foundational Skills & Industry-Recognized Credentials",
      advice: `With ${Math.round(lowEduCount / totalCohort * 100)}% of ${targetOccupation}s having a high school diploma or less, prioritize short-term, industry-recognized credentials that lead directly to employment. Focus on OSHA certifications, forklift operation, CDL training, and other credentials that have immediate labor market value in ${geography === 'All' ? 'Tennessee' : geography}'s ${sector} sector. Integrate adult basic education for those needing GED completion.`
    });
  } else if (isHighEducation) {
    recommendations.push({
      title: "Strategy: Advanced Credential Stacking & Management Pathways",
      advice: `With ${Math.round(highEduCount / totalCohort * 100)}% holding bachelor's degrees or higher, focus on management training, Six Sigma Black Belt certification, and professional certifications (PMP, SHRM-CP) that position ${targetOccupation}s for supervisory roles. For ${selectedCohort} workers with degrees, the barrier is often lack of management experience or industry-specific advanced credentials rather than education.`
    });
  } else {
    recommendations.push({
      title: "Strategy: Flexible Postsecondary Completion & Certificate Programs",
      advice: `Support ${targetOccupation}s in completing associate degrees or industry certificates through flexible delivery models (evening, weekend, online). Tennessee Colleges of Applied Technology (TCATs) offer accelerated programs aligned to ${sector} industry needs with job placement rates exceeding 85%. Emphasize stackable credentials that provide immediate wage gains while progressing toward degree completion.`
    });
  }

  // Recommendation 3: Sector-specific intervention
  if (isManufacturing) {
    recommendations.push({
      title: "Strategy: Advanced Manufacturing Skills & Automation Training",
      advice: `Tennessee's ${geography === 'All' ? 'statewide' : geography} manufacturing sector increasingly requires CNC machining, robotics maintenance, and industrial automation skills. Target ${targetOccupation}s for training in FANUC robotics certification, Siemens mechatronics, and Industry 4.0 competencies. Partner with manufacturers to create cohort-based training that guarantees job placement upon completion with $5-8/hour wage premiums.`
    });
  } else if (isHealthcare) {
    recommendations.push({
      title: "Strategy: Healthcare Career Ladders & Clinical Certifications",
      advice: `Create healthcare career pathways for ${targetOccupation}s moving from entry-level to clinical roles. Support CNA-to-LPN and LPN-to-RN bridge programs, or lateral moves into medical coding, pharmacy tech, or surgical tech roles. Tennessee's healthcare sector projects 15% growth through 2030, with median wages 40% higher than current ${selectedCohort} workers in ${geography === 'All' ? 'the state' : geography}.`
    });
  } else if (isRetail) {
    recommendations.push({
      title: "Strategy: Digital Commerce & Customer Experience Specialization",
      advice: `Retail and food service workers have transferable customer service skills valued in many sectors. Support ${targetOccupation}s in transitioning to higher-wage roles in sales operations, e-commerce logistics, customer success management, or hospitality management. Micro-credentials in Salesforce, digital marketing, and supply chain coordination can unlock 30-50% wage increases.`
    });
  } else if (isConstruction) {
    recommendations.push({
      title: "Strategy: Skilled Trades Credentialing & Supervisory Development",
      advice: `Construction offers clear pathways from apprentice to journeyman to master craftsperson. Support ${targetOccupation}s in obtaining electrical, plumbing, or HVAC licensure through Tennessee's registered apprenticeship programs. For experienced workers, focus on supervisor/foreman training, OSHA 30-hour, and project management fundamentals that lead to superintendent roles with 50%+ wage premiums.`
    });
  } else if (isProfessional) {
    recommendations.push({
      title: "Strategy: Technology Upskilling & Professional Certification",
      advice: `Professional services increasingly require digital literacy and technical specializations. Target ${targetOccupation}s for training in data analytics (SQL, Tableau, Power BI), cloud platforms (AWS, Azure), project management (PMP, Agile), or specialized software relevant to ${sector}. These credentials can unlock remote work opportunities and salary increases of 25-40% in ${geography === 'All' ? 'Tennessee' : geography}.`
    });
  } else if (isEducation) {
    recommendations.push({
      title: "Strategy: Educational Support Professional Development",
      advice: `Support ${targetOccupation}s in advancing from paraprofessional to licensed teacher roles through Tennessee's Grow Your Own teacher programs. Alternative licensure pathways and tuition assistance for bachelor's degree completion can transition classroom aides, substitute teachers, and support staff into full teaching positions with median salaries exceeding $52,000 in ${geography === 'All' ? 'Tennessee' : geography}.`
    });
  } else {
    recommendations.push({
      title: "Strategy: Cross-Sector Skills Transfer & Industry Switching",
      advice: `Identify transferable skills of ${targetOccupation}s that are valued in higher-wage sectors. For example, operations roles transfer to logistics management, customer service transfers to healthcare patient experience, and administrative skills transfer to professional services. Provide career navigation support to help workers identify viable transitions with minimal retraining.`
    });
  }

  // Recommendation 4: College completion (conditional)
  if (hasSomeCollege) {
    recommendations.push({
      title: "Strategy: College Completion & Credit for Prior Learning",
      advice: `${Math.round(someCollegeCount / totalCohort * 100)}% of ${targetOccupation}s in ${geography === 'All' ? 'Tennessee' : geography} have some college but no degree. Implement Tennessee Reconnect re-enrollment initiatives, reverse transfer programs that award associate degrees for accumulated credits, and Prior Learning Assessment to accelerate completion. Workers with associate degrees earn 20% more than those with some college; bachelor's degrees provide 65% wage premiums.`
    });
  }

  // Recommendation 5: Internal mobility pathways (always relevant)
  recommendations.push({
    title: "Strategy: Employer-Led Internal Mobility Systems",
    advice: `Work with ${sector} employers in ${geography === 'All' ? 'Tennessee' : geography} to develop transparent internal career pathways for ${targetOccupation}s. Implement skills-based progression frameworks where workers can advance through documented skill attainment rather than degree requirements. Successful models include tuition assistance (up to $5,250/year tax-free), paid time for training, and guaranteed wage increases upon credential completion.`
  });

  // Recommendation 6: Entrepreneurship (for specific occupations)
  const entrepreneurshipOccupations = ['Carpenters', 'Electricians', 'Plumbers', 'HVAC', 'Hair', 'Cosmetologists', 'Photographers', 'Designers', 'Drivers', 'Mechanics', 'Repair'];
  const isEntrepreneurshipViable = entrepreneurshipOccupations.some(occ => (targetOccupation || '').includes(occ));

  if (isEntrepreneurshipViable) {
    recommendations.push({
      title: "Strategy: Self-Employment & Microbusiness Development",
      advice: `Many ${targetOccupation}s have skills suited for independent contracting or small business ownership. Provide access to Tennessee Small Business Development Centers (TSBDC) for business planning, SCORE mentoring, and microfinance through community lenders. Self-employed skilled workers in ${sector} can earn 20-50% more than W-2 employees, with greater schedule flexibility. Support LLC formation, insurance procurement, and digital marketing training.`
    });
  }

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
                <span class="stat-val">${stats.st.toLocaleString()}</span>
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
                <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em;">Phase II: Intervention Roadmap</p>
                <h1>Strategic Recommendations</h1>
              </div>
              <div class="meta">
                Focus Occupation: ${targetOccupation}<br>
                Target Cohort: ${selectedCohort}
              </div>
            </div>

            <p style="font-size: 13px; line-height: 1.6; color: #334155; margin: 0 0 30px 0;">
              The following interventions are optimized for <strong>${targetOccupation}</strong> populations within <strong>${geography === 'All' ? 'Tennessee' : geography}</strong>. BGI analysis suggests that addressing these barriers for the <strong>${selectedCohort}</strong> cohort offers the most significant regional economic lift.
            </p>

            ${recommendations.map((r, i) => `
              <div class="rec-card">
                <h3>Priority Recommendation ${String(i + 1).padStart(2, '0')}</h3>
                <p class="rec-title">${r.title}</p>
                <p class="rec-advice">${r.advice}</p>
              </div>
            `).join('')}

            <div style="margin-top: 28px; padding-top: 20px; border-top: 2px solid #e2e8f0;">
              <h3 style="font-size: 11px; text-transform: uppercase; color: #1e3a8a; font-weight: 800; margin: 0 0 12px 0;">Economic Impact Forecast</h3>
              <p style="font-size: 12px; color: #64748b; line-height: 1.6; margin: 0;">
                Successfully moving individuals in this cohort through the recommended pathways is projected to reduce regional labor churn and stabilize middle-skill supply chains across the Tennessee ${sector} sector.
              </p>
            </div>

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
                  <span className={`text-xl sm:text-2xl font-black ${selectedCohort === 'Stalled' ? 'text-emerald-900' : 'text-slate-400'} absolute bottom-12 sm:bottom-16`}>{stats.st.toLocaleString()}</span>
                  <div className="invisible group-hover:visible absolute z-50 w-72 p-4 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 bottom-full mb-4 left-1/2 -translate-x-1/2 pointer-events-none">
                    <div className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2">Stalled Workers</div>
                    <div className="text-xs leading-relaxed">Workers who are either low-wage OR underemployed (or both). This represents the total population of 'stranded' workers who face barriers to economic mobility and career advancement in Tennessee.</div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-slate-900"></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="col-span-12 lg:col-span-6 bg-white p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-sm border border-slate-200">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 md:mb-10">Diagnostics: {selectedCohort}</h4>
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
            </div>
          </div>
        </section>

        {/* Step 3: Deep Dive */}
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
          </div>
        </section>

        {/* Step 4: Roadmap */}
        <section className="space-y-6 md:space-y-10">
          <div className="flex items-center gap-3 md:gap-4 border-b-2 border-slate-200 pb-4 md:pb-6">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs md:text-sm shadow-inner flex-shrink-0">04</div>
            <div>
              <h2 className="text-base md:text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Policy Roadmap</h2>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 md:mt-2">Strategic Interventions for Regional Lift</p>
            </div>
          </div>
          
          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-7 space-y-4 md:space-y-6">
              {recommendations.map((rec, i) => (
                <div
                  key={i}
                  onClick={() => setExpandedRec(expandedRec === i ? null : i)}
                  className={`p-6 md:p-10 rounded-[24px] md:rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === i ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className={`text-sm md:text-lg font-black uppercase tracking-tight ${expandedRec === i ? 'text-blue-900' : 'text-slate-500'}`}>{rec.title}</h3>
                    <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${expandedRec === i ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === i && (
                    <div className="mt-6 md:mt-8 animate-in fade-in slide-in-from-top-4">
                      <p className="text-sm md:text-base text-slate-600 leading-relaxed font-medium">{rec.advice}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
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
                      <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">Occupation</span>
                      <span className="font-bold text-xs md:text-sm truncate max-w-[150px] md:max-w-[200px]">{targetOccupation}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-2 md:pb-3">
                      <span className="text-blue-300 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">Strandedness</span>
                      <span className="font-bold text-xs md:text-sm">{selectedCohort}</span>
                    </div>
                  </div>

                  <div className="space-y-6 md:space-y-10">
                    <div className="flex items-center gap-4 md:gap-8">
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                        <TrendingUp size={24} className="md:w-7 md:h-7" />
                      </div>
                      <div>
                        <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Potential Wage Uplift Range</p>
                        <p className="text-2xl md:text-3xl font-black">+18% - 25% Avg.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 md:gap-8">
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
                        <Users size={24} className="md:w-7 md:h-7" />
                      </div>
                      <div>
                        <p className="text-[10px] md:text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-1 md:mb-2">Total Workers in Pool</p>
                        <p className="text-2xl md:text-3xl font-black">{(cohortBreakdowns.occ.find(d => d[0] === targetOccupation)?.[1] || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
root.render(<App />);