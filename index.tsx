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
import TennesseeMap from './src/components/TennesseeMap';
import dashboardData from './src/data/dashboard_summary_data.json';

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
  'Graduate degree'
];

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55+'];

// --- Load Real Data ---
const loadData = (): DataRow[] => {
  // Map the imported data to the expected format
  return (dashboardData as any[]).map((row: any) => ({
    msa_category: row.msa_category,
    NAICS2_NAME: row.NAICS2_NAME || 'Other',
    n_weighted: row.n_weighted || 0,
    n_weighted_low_wage: row.n_weighted_low_wage || 0,
    n_weighted_underemployed: row.n_weighted_underemployed || 0,
    n_weighted_stalled: row.n_weighted_stalled || 0,
    education_level_label: row.education_level_label,
    soc_2019_5_acs_name: row.soc_2019_5_acs_name || 'Other',
    age_group: row.age_group
  }));
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

const App = () => {
  const [geography, setGeography] = useState<MSACategory>('All');
  const [sector, setSector] = useState<string>('Manufacturing');
  const [selectedCohort, setSelectedCohort] = useState<CohortType>('All Stranded');
  const [targetOccupation, setTargetOccupation] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(0);

  const rawData = useMemo(() => loadData(), []);
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

  // Check if "Some college" is a significant portion of the selected cohort
  const someCollegeCount = cohortBreakdowns.edu.find(([label]) => label === 'Some college')?.[1] || 0;
  const totalEdu = cohortBreakdowns.edu.reduce((sum, [, val]) => sum + val, 0);
  const includeCollegeCompletion = someCollegeCount / totalEdu > 0.15; // If >15% have some college

  const recommendations = [
    {
      title: "Strategy: Non-Degree Credential Alignment",
      advice: `BGI analysis suggests that for front-line workers like ${targetOccupation}s, non-degree credentials in high-demand technical fields have high rates of success in the ${geography} MSA. Recommend bridge funding for certificate programs with local community colleges.`
    },
    {
      title: "Strategy: Skills-Adjacent Field Transition",
      advice: `Target 'Skills-Adjacent' roles in Logistics; the current mechanical and operational skills of ${targetOccupation}s transfer with high overlap to higher-paying supervisor or coordination roles within the ${sector} industry.`
    },
    {
      title: "Strategy: Internal Mobility Pathways",
      advice: `Develop internal labor market ladders for ${targetOccupation}s. Employer-led upskilling programs focusing on advanced tool-usage or management lead to documented wage premiums for ${selectedCohort} populations in Tennessee.`
    },
    ...(includeCollegeCompletion ? [{
      title: "Strategy: College Completion Support",
      advice: `A significant portion of ${targetOccupation}s in ${geography} have some college but no degree. Implement re-enrollment programs, flexible course scheduling, and credit for prior learning assessments to help workers complete their bachelor's degrees, unlocking career advancement opportunities.`
    }] : []),
    {
      title: "Strategy: Wage-Boosting Skills Training",
      advice: `Targeted micro-credentialing in high-value skills can boost wages for ${targetOccupation}s. For ${sector} roles, this includes advanced software proficiency (AutoCAD, ERP systems), quality control certifications (Six Sigma, Lean), safety credentials (OSHA 30-hour), and technical communication skills that position workers for supervisory roles.`
    },
    {
      title: "Strategy: Entrepreneurship & Freelance Transition",
      advice: `For ${targetOccupation}s with established client relationships and specialized skills, transitioning to independent contracting or freelance work can increase earnings by 20-40%. Provide business development training, legal structure guidance (LLC formation), and access to platforms connecting skilled trades with commercial clients.`
    }
  ];

  const handleExportBrief = () => {
    const renderReportBar = (label: string, value: number, max: number, color: string = '#1e3a8a') => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">
          <span>${label}</span>
          <span>${value.toLocaleString()}</span>
        </div>
        <div style="height: 10px; width: 100%; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
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
            body { font-family: 'Inter', sans-serif; padding: 0; margin: 0; color: #1e293b; background: #fff; }
            .page { padding: 80px; height: 100vh; box-sizing: border-box; page-break-after: always; position: relative; display: flex; flex-direction: column; }
            .header { border-bottom: 4px solid #1e3a8a; padding-bottom: 25px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
            .header h1 { margin: 0; text-transform: uppercase; font-size: 26px; color: #1e3a8a; font-weight: 800; letter-spacing: -0.025em; }
            .header .meta { text-align: right; font-size: 11px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.6; }
            h2 { color: #1e3a8a; border-left: 6px solid #f59e0b; padding-left: 15px; text-transform: uppercase; font-size: 16px; margin-top: 40px; margin-bottom: 20px; font-weight: 800; }
            .grid { display: grid; grid-template-cols: 1fr 1fr; gap: 40px; flex: 1; }
            .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 25px; border-radius: 16px; text-align: center; }
            .stat-val { font-size: 34px; font-weight: 800; color: #1e40af; display: block; letter-spacing: -0.05em; }
            .stat-label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 5px; }
            .rec-card { background: #1e3a8a; color: white; padding: 35px; border-radius: 20px; margin-top: 30px; }
            .rec-card h3 { color: #f59e0b; margin-top: 0; text-transform: uppercase; font-size: 12px; font-weight: 800; letter-spacing: 0.1em; margin-bottom: 12px; }
            .footer { position: absolute; bottom: 40px; left: 80px; right: 80px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 9px; color: #94a3b8; text-align: center; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; }
            @media print { .page { height: 100vh; overflow: hidden; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em;">Phase I: Diagnostic Inventory</p>
                <h1>Stranded Talent Analysis</h1>
              </div>
              <div class="meta">
                Region: ${geography} MSA<br>
                Industry: ${sector}<br>
                Briefing Date: ${new Date().toLocaleDateString()}
              </div>
            </div>

            <div style="display: grid; grid-template-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 30px;">
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

            <div class="grid">
              <div>
                <h2>Demographic Profile: ${selectedCohort}</h2>
                <div style="margin-bottom: 30px;">
                  <h3 style="font-size: 11px; text-transform: uppercase; color: #1e3a8a; margin-bottom: 15px; font-weight: 800;">Age Distribution</h3>
                  ${cohortBreakdowns.age.map(([label, val]) => renderReportBar(label, val, maxAge)).join('')}
                </div>
                <div>
                  <h3 style="font-size: 11px; text-transform: uppercase; color: #1e3a8a; margin-bottom: 15px; font-weight: 800;">Education Pipeline</h3>
                  ${cohortBreakdowns.edu.map(([label, val]) => renderReportBar(label, val, maxEdu, '#f59e0b')).join('')}
                </div>
              </div>
              <div>
                <h2>Occupational Distribution</h2>
                <p style="font-size: 11px; color: #64748b; margin-bottom: 20px; text-transform: uppercase; font-weight: 800;">Primary Target Nodes</p>
                ${cohortBreakdowns.occ.slice(0, 10).map(([label, val]) => renderReportBar(label, val, maxOcc, '#10b981')).join('')}
              </div>
            </div>
            <div class="footer">Tennessee BGI Strategic Workforce Initiative | Executive Confidential</div>
          </div>

          <div class="page">
            <div class="header">
              <div>
                <p style="margin: 0; font-size: 10px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.1em;">Phase II: Intervention Roadmap</p>
                <h1>Strategic Recommendations</h1>
              </div>
              <div class="meta">
                Focus Occupation: ${targetOccupation}<br>
                Target Cohort: ${selectedCohort}
              </div>
            </div>

            <p style="font-size: 14px; line-height: 1.7; color: #334155; margin-bottom: 40px;">
              The following interventions are optimized for <strong>${targetOccupation}</strong> populations within the <strong>${geography}</strong> MSA. BGI analysis suggests that addressing these barriers for the <strong>${selectedCohort}</strong> cohort offers the most significant regional economic lift.
            </p>

            ${recommendations.map((r, i) => `
              <div class="rec-card">
                <h3>Priority Recommendation 0${i+1}</h3>
                <p style="font-size: 18px; font-weight: 800; margin: 0; color: #fef3c7;">${r.title}</p>
                <p style="font-size: 14px; line-height: 1.7; margin-top: 15px; color: #e2e8f0; font-weight: 400;">${r.advice}</p>
              </div>
            `).join('')}

            <div style="margin-top: auto; padding-top: 50px;">
              <h3 style="font-size: 11px; text-transform: uppercase; color: #1e3a8a; font-weight: 800; margin-bottom: 15px;">Economic Impact Forecast</h3>
              <p style="font-size: 12px; color: #64748b; line-height: 1.7;">
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 font-['Inter']">
      <nav className="bg-[#1E3A8A] text-white py-6 px-10 shadow-xl sticky top-0 z-50 flex items-center justify-between border-b-4 border-amber-500">
        <div className="flex items-center gap-5">
          <div className="p-3 bg-white/10 rounded-2xl shadow-inner backdrop-blur-md">
            <LayoutDashboard size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">Stranded Talent Interactive</h1>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mt-1">Tennessee BGI Policy Dashboard</p>
          </div>
        </div>
        <button 
          onClick={handleExportBrief}
          className="flex items-center gap-3 bg-white hover:bg-slate-100 text-blue-950 px-8 py-3 rounded-2xl font-black text-xs uppercase transition-all shadow-xl active:scale-95 group"
        >
          <Download size={18} className="group-hover:translate-y-0.5 transition-transform" /> Export Executive Brief
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-10 py-12 space-y-24">
        
        {/* Step 1: Selection */}
        <section className="space-y-10">
          <div className="flex items-center gap-4 border-b-2 border-slate-200 pb-6">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shadow-inner">01</div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Regional & Sector Scope</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Baseline Diagnostic Definition</p>
            </div>
          </div>
          
          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-7">
              <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200">
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
              <div className="bg-white p-12 rounded-[40px] shadow-sm border border-slate-200">
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
                <div className="mt-12 grid grid-cols-2 gap-6">
                  <div className="p-6 bg-blue-900 rounded-[32px] text-white">
                    <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-2">Total Workers</p>
                    <p className="text-3xl font-black">{stats.total.toLocaleString()}</p>
                  </div>
                  <div className="p-6 bg-amber-500 rounded-[32px] text-blue-950">
                    <p className="text-[10px] font-black text-blue-950/40 uppercase tracking-widest mb-2">Stranded Rate</p>
                    <p className="text-3xl font-black">{((stats.lw / stats.total) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2: Landscape */}
        <section className="space-y-10">
          <div className="flex items-center gap-4 border-b-2 border-slate-200 pb-6">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shadow-inner">02</div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">The Stranded Landscape</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Cohort Identification & Intersection</p>
            </div>
          </div>
          
          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-6 bg-white p-12 rounded-[40px] shadow-sm border border-slate-200 flex items-center justify-center">
              <div className="relative w-80 h-80">
                <div
                  onClick={() => setSelectedCohort('Low Wage')}
                  className={`absolute w-52 h-52 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center top-0 left-0 hover:z-30 ${
                    selectedCohort === 'Low Wage' ? 'bg-blue-600/40 border-blue-600 z-20 scale-105 shadow-xl' : 'bg-blue-500/5 border-blue-200 opacity-60'
                  }`}
                >
                  <span className={`text-[11px] font-black uppercase tracking-widest absolute -top-8 ${selectedCohort === 'Low Wage' ? 'text-blue-900' : 'text-slate-400'}`}>Low Wage</span>
                  <span className={`text-2xl font-black ${selectedCohort === 'Low Wage' ? 'text-blue-900' : 'text-slate-400'} absolute top-16 left-8`}>{stats.lw.toLocaleString()}</span>
                </div>
                <div
                  onClick={() => setSelectedCohort('Underemployed')}
                  className={`absolute w-52 h-52 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center top-0 right-0 hover:z-30 ${
                    selectedCohort === 'Underemployed' ? 'bg-amber-500/40 border-amber-600 z-20 scale-105 shadow-xl' : 'bg-amber-500/5 border-amber-200 opacity-60'
                  }`}
                >
                  <span className={`text-[11px] font-black uppercase tracking-widest absolute -top-8 ${selectedCohort === 'Underemployed' ? 'text-amber-900' : 'text-slate-400'}`}>Underemployed</span>
                  <span className={`text-2xl font-black ${selectedCohort === 'Underemployed' ? 'text-amber-900' : 'text-slate-400'} absolute top-16 right-8`}>{stats.ue.toLocaleString()}</span>
                </div>
                <div
                  onClick={() => setSelectedCohort('Stalled')}
                  className={`absolute w-52 h-52 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center bottom-0 left-1/2 -translate-x-1/2 hover:z-30 ${
                    selectedCohort === 'Stalled' ? 'bg-emerald-500/40 border-emerald-600 z-20 scale-105 shadow-xl' : 'bg-emerald-500/5 border-emerald-200 opacity-60'
                  }`}
                >
                  <span className={`text-[11px] font-black uppercase tracking-widest absolute -bottom-8 ${selectedCohort === 'Stalled' ? 'text-emerald-900' : 'text-slate-400'}`}>Stalled</span>
                  <span className={`text-2xl font-black ${selectedCohort === 'Stalled' ? 'text-emerald-900' : 'text-slate-400'} absolute bottom-16`}>{stats.st.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="col-span-12 lg:col-span-6 bg-white p-12 rounded-[40px] shadow-sm border border-slate-200">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-10">Diagnostics: {selectedCohort}</h4>
              <div className="grid grid-cols-2 gap-12">
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
              <div className="mt-12 pt-10 border-t border-slate-100">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><BarChart3 size={14} className="text-emerald-500"/> Occupations with Most Stranded Workers</p>
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
        <section className="space-y-10">
          <div className="flex items-center gap-4 border-b-2 border-slate-200 pb-6">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shadow-inner">03</div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Occupational Selection</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Drill-Down to Targeted Intervention Nodes</p>
            </div>
          </div>
          
          <div className="bg-white p-12 rounded-[40px] shadow-sm border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              {cohortBreakdowns.occ.slice(0, 10).map(([occ, val]) => (
                <div 
                  key={occ} 
                  onClick={() => setTargetOccupation(occ)}
                  className={`p-6 rounded-[32px] border-2 cursor-pointer transition-all duration-300 ${
                    targetOccupation === occ ? 'bg-blue-900 border-blue-900 shadow-xl -translate-y-1' : 'bg-white border-slate-100 hover:border-blue-300'
                  }`}
                >
                  <p className={`font-black uppercase tracking-tighter text-sm mb-4 truncate ${targetOccupation === occ ? 'text-blue-200' : 'text-slate-800'}`}>{occ}</p>
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${targetOccupation === occ ? 'text-blue-400' : 'text-slate-400'}`}>
                      {selectedCohort === 'All Stranded' ? 'Stranded Workers' : `${selectedCohort} Workers`}
                    </span>
                    <span className={`text-lg font-black ${targetOccupation === occ ? 'text-white' : 'text-blue-950'}`}>{val.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Step 4: Roadmap */}
        <section className="space-y-10">
          <div className="flex items-center gap-4 border-b-2 border-slate-200 pb-6">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shadow-inner">04</div>
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none">Policy Roadmap</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Strategic Interventions for Regional Lift</p>
            </div>
          </div>
          
          <div className="grid grid-cols-12 gap-10">
            <div className="col-span-12 lg:col-span-7 space-y-6">
              {recommendations.map((rec, i) => (
                <div 
                  key={i}
                  onClick={() => setExpandedRec(expandedRec === i ? null : i)}
                  className={`p-10 rounded-[40px] border-2 cursor-pointer transition-all duration-300 ${
                    expandedRec === i ? 'bg-white border-blue-600 shadow-xl' : 'bg-slate-50 border-transparent hover:bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className={`text-lg font-black uppercase tracking-tight ${expandedRec === i ? 'text-blue-900' : 'text-slate-500'}`}>{rec.title}</h3>
                    <ChevronDown className={`transition-transform duration-300 ${expandedRec === i ? 'rotate-180 text-blue-600' : 'text-slate-300'}`} />
                  </div>
                  {expandedRec === i && (
                    <div className="mt-8 animate-in fade-in slide-in-from-top-4">
                      <p className="text-slate-600 leading-relaxed font-medium">{rec.advice}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="col-span-12 lg:col-span-5">
              <div className="bg-[#1E3A8A] text-white p-12 rounded-[50px] shadow-2xl relative overflow-hidden h-full flex flex-col border-t-8 border-amber-500">
                <div className="relative z-10">
                  <h3 className="text-2xl font-black leading-tight mb-8 tracking-tighter uppercase text-amber-400">Target Group Profile</h3>
                  
                  <div className="mb-10 space-y-4">
                    <div className="flex justify-between border-b border-white/10 pb-3">
                      <span className="text-blue-300 text-[10px] uppercase font-bold tracking-widest">Region</span>
                      <span className="font-bold text-sm">{geography}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-3">
                      <span className="text-blue-300 text-[10px] uppercase font-bold tracking-widest">Sector</span>
                      <span className="font-bold text-sm truncate max-w-[200px]">{sector}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-3">
                      <span className="text-blue-300 text-[10px] uppercase font-bold tracking-widest">Occupation</span>
                      <span className="font-bold text-sm truncate max-w-[200px]">{targetOccupation}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-3">
                      <span className="text-blue-300 text-[10px] uppercase font-bold tracking-widest">Strandedness</span>
                      <span className="font-bold text-sm">{selectedCohort}</span>
                    </div>
                  </div>

                  <div className="space-y-10">
                    <div className="flex items-center gap-8">
                      <div className="w-16 h-16 rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner">
                        <TrendingUp size={28} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-2">Potential Wage Uplift Range</p>
                        <p className="text-3xl font-black">+18% - 25% Avg.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="w-16 h-16 rounded-[24px] bg-white/5 flex items-center justify-center text-amber-400 shadow-inner">
                        <Users size={28} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase text-blue-300 tracking-widest mb-2">Total Workers in Pool</p>
                        <p className="text-3xl font-black">{(cohortBreakdowns.occ.find(d => d[0] === targetOccupation)?.[1] || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="max-w-7xl mx-auto px-10 py-16 border-t border-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-widest text-center flex justify-between items-center">
        <span>BGI Data Analytics © 2025 | Tennessee Strategic Workforce Dashboard</span>
        <div className="flex gap-10">
          <a href="#" className="hover:text-blue-600">Methodology</a>
          <a href="#" className="hover:text-blue-600">Source Data</a>
        </div>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);