import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let apiKey: string | undefined;
  try {
    const body = await req.json();
    apiKey = body.apiKey;
  } catch {
    return NextResponse.json({ valid: false, error: 'Invalid request.' }, { status: 400 });
  }

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ valid: false, error: 'No API key provided.' }, { status: 400 });
  }

  if (!apiKey.startsWith('sk-')) {
    return NextResponse.json({
      valid: false,
      error: 'Key format looks wrong — OpenAI keys start with "sk-".',
    });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });

    if (res.ok) {
      return NextResponse.json({ valid: true });
    }

    const data = await res.json().catch(() => ({}));
    const code: string = data?.error?.code ?? '';
    const type: string = data?.error?.type ?? '';

    if (res.status === 401 || code === 'invalid_api_key') {
      return NextResponse.json({ valid: false, error: 'Invalid API key — check it and try again.' });
    }
    if (code === 'insufficient_quota' || type === 'insufficient_quota') {
      return NextResponse.json({ valid: false, error: 'Key is valid but has no remaining quota.' });
    }

    return NextResponse.json({ valid: false, error: 'OpenAI rejected the key. Check it and try again.' });
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Could not reach OpenAI — check your network and try again.' },
      { status: 502 }
    );
  }
}
