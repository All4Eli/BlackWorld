// ═══════════════════════════════════════════════════════════════════
// Education API Route Handler — GET & POST /api/education
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import {
  getEducationCourses,
  getPlayerEducation,
  enrollCourse,
  claimCourse,
  tickPlayerResources
} from '@/lib/db/dal/expansion';

async function handleGet(request, { userId }) {
  try {
    const { data: courses, error: err1 } = await getEducationCourses();
    const { data: playerEd, error: err2 } = await getPlayerEducation(userId);

    if (err1 || err2) {
      return NextResponse.json({ error: 'Failed to fetch education state' }, { status: 500 });
    }

    const now = new Date();
    let activeCourse = null;
    const completedCourses = [];

    if (playerEd && playerEd.length > 0) {
      for (const rec of playerEd) {
        if (!rec.is_completed) {
          const startedAt = new Date(rec.started_at).getTime();
          const completesAt = new Date(rec.completes_at).getTime();
          const totalDuration = completesAt - startedAt;
          const elapsed = now.getTime() - startedAt;
          const remainingSec = Math.max(0, Math.ceil((completesAt - now.getTime()) / 1000));
          const progressPct = totalDuration > 0
            ? Math.min(100, Math.max(0, Math.floor((elapsed / totalDuration) * 100)))
            : 100;

          activeCourse = {
            id: rec.id,
            course_id: rec.course_id,
            title: rec.title,
            description: rec.description,
            stat_boost_type: rec.stat_boost_type,
            stat_boost_val: rec.stat_boost_val,
            perk_code: rec.perk_code,
            started_at: rec.started_at,
            completes_at: rec.completes_at,
            progress_pct: progressPct,
            remaining_seconds: remainingSec,
            is_ready_to_claim: remainingSec === 0
          };
        } else {
          completedCourses.push({
            id: rec.id,
            course_id: rec.course_id,
            title: rec.title,
            stat_boost_type: rec.stat_boost_type,
            stat_boost_val: rec.stat_boost_val,
            perk_code: rec.perk_code,
            claimed_at: rec.claimed_at
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      courses: courses || [],
      active_course: activeCourse,
      completed_courses: completedCourses
    });
  } catch (err) {
    console.error('[GET /api/education]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handlePost(request, { userId }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, courseId } = body || {};

    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
    }

    // Default action to 'enroll' if not specified
    const act = action || 'enroll';

    if (act === 'enroll') {
      const result = await enrollCourse(userId, courseId);
      if (result.error) {
        const status = result.status || 400;
        if (result.error.code === 'IN_DUNGEON') {
          return NextResponse.json(
            {
              error: 'You are currently in the Dungeon (Jail)!',
              code: 'IN_DUNGEON',
              jail_until: result.error.jail_until,
              jail_reason: result.error.jail_reason,
              remaining_seconds: result.error.remaining_seconds
            },
            { status: 403 }
          );
        }
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });
    } else if (act === 'claim') {
      const result = await claimCourse(userId, courseId);
      if (result.error) {
        const status = result.status || 400;
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });
    } else {
      return NextResponse.json({ error: `Invalid action '${act}'. Must be 'enroll' or 'claim'.` }, { status: 400 });
    }
  } catch (err) {
    console.error('[POST /api/education]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withMiddleware(handleGet, { requireAuth: true });
export const POST = withMiddleware(handlePost, { requireAuth: true });
