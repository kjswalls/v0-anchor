import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// TODO: Set GITHUB_TOKEN as an environment variable in Vercel dashboard before deploying.
// GITHUB_TOKEN is loaded from ~/.openclaw/.env on this machine.

/**
 * POST /api/bug-report
 *
 * Creates a GitHub issue and logs the report to Supabase.
 * Works for both authenticated and unauthenticated users.
 *
 * Body: { title: string, description?: string, steps?: string, type: "bug" | "feature" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    title?: string;
    description?: string;
    steps?: string;
    type?: string;
  };

  const { title, description, steps, type } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const reportType: 'bug' | 'feature' = type === 'feature' ? 'feature' : 'bug';

  // Get current user — optional, no auth required
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const isKirby = !!user?.id && user.id === process.env.KIRBY_USER_ID;

  // Build labels
  const labels: string[] = reportType === 'bug' ? ['bug'] : ['enhancement'];
  labels.push(isKirby ? 'internal' : 'user-reported');

  // Build issue body
  const bodyParts: string[] = [];
  if (description?.trim()) {
    bodyParts.push(description.trim());
  }
  if (reportType === 'bug' && steps?.trim()) {
    bodyParts.push(`## Steps to reproduce\n\n${steps.trim()}`);
  }
  bodyParts.push('---\n_Reported via Anchor app_');
  const issueBody = bodyParts.join('\n\n');

  // POST to GitHub
  const githubRes = await fetch('https://api.github.com/repos/kjswalls/v0-anchor/issues', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'anchor-app',
    },
    body: JSON.stringify({ title: title.trim(), body: issueBody, labels }),
  });

  if (githubRes.status !== 201) {
    console.error('GitHub issue creation failed:', githubRes.status, await githubRes.text());
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 });
  }

  const issueData = await githubRes.json() as { number: number; html_url: string };

  // Insert into bug_reports using service role client
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY not set — skipping bug_reports insert');
  } else {
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );
    const { error: insertError } = await serviceClient.from('bug_reports').insert({
      github_issue_number: issueData.number,
      supabase_user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      report_type: reportType,
    });
    if (insertError) {
      console.error('bug_reports insert failed:', insertError.message);
    }
  }

  return NextResponse.json({
    ok: true,
    issueNumber: issueData.number,
    issueUrl: issueData.html_url,
  });
}
