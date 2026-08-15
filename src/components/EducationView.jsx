'use client';
import { useState, useEffect } from 'react';
import { usePlayer } from '@/context/PlayerContext';

export default function EducationView({ onBack }) {
  const { hero, updateHero } = usePlayer();
  const [courses, setCourses] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [completedCourses, setCompletedCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const fetchEducationData = async () => {
    try {
      const res = await fetch('/api/education');
      const data = await res.json();
      if (res.ok) {
        setCourses(data.courses || []);
        setActiveCourse(data.active_course || null);
        setCompletedCourses(data.completed_courses || []);
      }
    } catch (err) {
      console.error('Failed to fetch education data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEducationData();
  }, []);

  // Real-time course countdown timer
  useEffect(() => {
    if (!activeCourse || activeCourse.remaining_seconds <= 0) return;

    const timer = setInterval(() => {
      setActiveCourse(prev => {
        if (!prev) return null;
        const newSec = Math.max(0, prev.remaining_seconds - 1);
        const startedAt = new Date(prev.started_at).getTime();
        const completesAt = new Date(prev.completes_at).getTime();
        const totalDuration = completesAt - startedAt;
        const elapsed = Date.now() - startedAt;
        const pct = totalDuration > 0 ? Math.min(100, Math.max(0, Math.floor((elapsed / totalDuration) * 100))) : 100;

        return {
          ...prev,
          remaining_seconds: newSec,
          progress_pct: pct,
          is_ready_to_claim: newSec === 0,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeCourse?.remaining_seconds]);

  const handleEnroll = async (courseId) => {
    if (submitting || activeCourse) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/education', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll', courseId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to enroll in course.' });
        return;
      }

      setMsg({ success: true, text: 'Enrolled successfully! Course studying commenced.' });
      await fetchEducationData();

      if (updateHero && data.cost_gold) {
        updateHero({ gold: Math.max(0, (hero?.gold || 0) - data.cost_gold) });
      }
    } catch (err) {
      setMsg({ success: false, text: 'Connection error during course enrollment.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (courseId) => {
    if (submitting) return;

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/education', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', courseId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ success: false, text: data.error || 'Failed to claim graduation perks.' });
        return;
      }

      setMsg({
        success: true,
        text: `Graduated! Unlocked perk '${data.perk_unlocked || 'Graduate'}' (+${data.stat_boost?.val || 0} ${data.stat_boost?.type || 'Stat'}).`,
      });

      await fetchEducationData();

      if (updateHero && data.stat_boost?.type) {
        const type = data.stat_boost.type;
        const val = data.stat_boost.val || 0;
        updateHero({ [type]: (hero?.[type] || 0) + val });
      }
    } catch (err) {
      setMsg({ success: false, text: 'Connection error while claiming perks.' });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const fallbackCourses = [
    { id: 'edu1', title: 'Physical Training', description: 'Core physical conditioning and endurance techniques.', duration_seconds: 300, cost_gold: 500, stat_boost_type: 'str', stat_boost_val: 5, perk_code: 'PT_CERT' },
    { id: 'edu2', title: 'Combat Tactics', description: 'Master tactical positioning and weapon handling.', duration_seconds: 900, cost_gold: 1500, stat_boost_type: 'spd', stat_boost_val: 10, perk_code: 'TACTICIAN' },
    { id: 'edu3', title: 'Economics 101', description: 'Understanding market trades, interest rates, and investments.', duration_seconds: 1800, cost_gold: 3000, stat_boost_type: 'max_energy', stat_boost_val: 10, perk_code: 'FINANCIER' },
    { id: 'edu4', title: 'Advanced Stealth', description: 'Covert maneuvers, lockpicking, and infiltration methods.', duration_seconds: 3600, cost_gold: 5000, stat_boost_type: 'dex', stat_boost_val: 15, perk_code: 'SHADOW_WALKER' },
  ];

  const courseList = courses.length > 0 ? courses : fallbackCourses;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
      {onBack && (
        <button onClick={onBack} className="text-stone-500 hover:text-stone-300 font-mono text-xs uppercase tracking-widest text-left">
          ← Back to City Directory
        </button>
      )}

      <div className="border border-neutral-900 bg-[#050505] p-8 flex flex-col items-center shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        <h1 className="text-3xl font-black uppercase tracking-[0.2em] font-serif text-stone-200 mb-2">
          Blackwood Academy
        </h1>
        <p className="text-stone-500 font-mono text-xs tracking-widest text-center max-w-md mb-8">
          Expand your intellect and discipline. Enroll in structured curricula for permanent stat boosts and elite perks.
        </p>

        {/* Message Notice */}
        {msg && (
          <div
            className={`w-full max-w-xl mb-6 p-4 border font-mono text-xs text-center ${
              msg.success
                ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                : 'bg-red-950/40 border-red-800 text-red-400'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* ACTIVE ENROLLMENT SECTION */}
        {activeCourse ? (
          <div className="w-full max-w-xl bg-[#020202] border border-cyan-900/50 p-6 mb-8 relative">
            <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold block mb-1">
              🎓 Active Course Enrollment
            </span>
            <h2 className="text-xl font-serif font-bold text-stone-100 uppercase tracking-wide mb-1">
              {activeCourse.title}
            </h2>
            <p className="text-xs font-mono text-stone-400 mb-4">{activeCourse.description}</p>

            <div className="flex justify-between items-center font-mono text-xs uppercase tracking-widest mb-2">
              <span className="text-stone-400">Progress</span>
              <span className="text-cyan-400 font-bold">
                {activeCourse.progress_pct}%
              </span>
            </div>

            <div className="w-full h-3 bg-neutral-950 border border-neutral-800 rounded-xs overflow-hidden mb-4">
              <div
                className="h-full bg-cyan-600 transition-all duration-300"
                style={{ width: `${activeCourse.progress_pct}%` }}
              />
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <span className="font-mono text-xs text-stone-400">
                Time Remaining: <strong className="text-stone-200">{formatDuration(activeCourse.remaining_seconds)}</strong>
              </span>

              <button
                onClick={() => handleClaim(activeCourse.course_id)}
                disabled={!activeCourse.is_ready_to_claim || submitting}
                className="px-6 py-2 border border-cyan-700 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900 font-mono text-xs uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Claiming...' : activeCourse.is_ready_to_claim ? 'Claim Graduation Perks' : 'Studying...'}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-xl bg-[#020202] border border-neutral-800 p-4 mb-8 text-center font-mono text-xs text-stone-500 uppercase tracking-widest">
            No active course enrollment. Select a course from the catalog below.
          </div>
        )}

        {/* COURSE CATALOG */}
        <div className="w-full flex flex-col gap-4">
          <h2 className="text-xs font-mono uppercase tracking-[0.3em] text-stone-500 border-b border-red-900/20 pb-2">
            Course Catalog
          </h2>

          {loading ? (
            <div className="py-8 text-center font-mono text-xs text-stone-600 uppercase tracking-widest">
              Loading course catalog...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {courseList.map((course) => {
                const isCompleted = completedCourses.some(c => c.course_id === course.id);
                const isCurrentActive = activeCourse?.course_id === course.id;
                const canEnroll = !activeCourse && !isCompleted && (hero?.gold || 0) >= (course.cost_gold || 0);

                return (
                  <div
                    key={course.id}
                    className={`border p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors ${
                      isCompleted
                        ? 'border-emerald-900/30 bg-emerald-950/5 opacity-70'
                        : isCurrentActive
                        ? 'border-cyan-900/50 bg-cyan-950/10'
                        : 'border-neutral-900 bg-black/60 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex flex-col gap-1 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-serif font-bold uppercase tracking-wider text-stone-200 text-base">
                          {course.title}
                        </h3>
                        {isCompleted && (
                          <span className="text-[9px] font-mono px-2 py-0.5 border border-emerald-800 bg-emerald-950/40 text-emerald-400 uppercase tracking-widest">
                            Graduated
                          </span>
                        )}
                        {isCurrentActive && (
                          <span className="text-[9px] font-mono px-2 py-0.5 border border-cyan-800 bg-cyan-950/40 text-cyan-400 uppercase tracking-widest">
                            In Progress
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-stone-500">{course.description}</p>

                      <div className="flex flex-wrap items-center gap-4 mt-2 font-mono text-[11px]">
                        <span className="text-stone-400">
                          Duration: <strong className="text-stone-300">{formatDuration(course.duration_seconds)}</strong>
                        </span>
                        <span className="text-stone-400">
                          Tuition: <strong className="text-yellow-600">{(course.cost_gold || 0).toLocaleString()}g</strong>
                        </span>
                        <span className="text-stone-400">
                          Boost: <strong className="text-cyan-400">+{course.stat_boost_val} {course.stat_boost_type?.toUpperCase()}</strong>
                        </span>
                        {course.perk_code && (
                          <span className="text-stone-400">
                            Perk: <strong className="text-purple-400">{course.perk_code}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {!isCompleted && !isCurrentActive && (
                      <button
                        onClick={() => handleEnroll(course.id)}
                        disabled={!canEnroll || submitting}
                        title={
                          activeCourse
                            ? 'Already enrolled in a course'
                            : (hero?.gold || 0) < (course.cost_gold || 0)
                            ? 'Insufficient gold'
                            : 'Enroll in course'
                        }
                        className="w-full md:w-auto px-6 py-3 border border-neutral-800 bg-black text-stone-300 hover:bg-neutral-900 hover:text-stone-100 font-mono text-xs uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        Enroll
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
