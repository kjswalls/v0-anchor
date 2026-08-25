import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingRow } from '@/components/settings/setting-row';
import type { SettingCtx, SettingRecord } from '@/lib/settings/manifest';

/**
 * The write-only credential control.
 *
 * Its read() returns '' whatever is stored, because /api/reminders/secrets will
 * not say — user_secrets has its grants revoked from `authenticated` and the
 * route answers only "which keys are set". That makes this the one control in
 * the app whose displayed value is never its stored value, so the draft
 * lifecycle needs its own coverage: everything else here relies on `value`
 * changing after a write, and this one's cannot.
 */

const ctx: SettingCtx = { theme: 'system', setTheme: () => {}, userId: 'u1' };

const secretRecord = (write: (v: string | boolean) => void): SettingRecord => ({
  id: 'extensions.phone-call.authToken',
  pane: 'extensions',
  label: 'Auth token',
  control: 'text',
  textVariant: 'secret',
  placeholder: 'Not set',
  keywords: ['twilio', 'token', 'credential'],
  read: () => '',
  write,
  defaultValue: '',
});

function renderRow(write = vi.fn()) {
  render(
    <SettingRow
      record={secretRecord(write)}
      ctx={ctx}
      value=""
      onWrite={write}
      disabled={false}
    />,
  );
  return { write, input: screen.getByLabelText('Auth token') as HTMLInputElement };
}

describe('the write-only credential row', () => {
  it('masks what is being typed', () => {
    const { input } = renderRow();
    expect(input.type).toBe('password');
  });

  it('sends the token on blur', () => {
    const { write, input } = renderRow();
    fireEvent.change(input, { target: { value: 'tok_123' } });
    fireEvent.blur(input);
    expect(write).toHaveBeenCalledWith('tok_123');
  });

  // `value` is '' before and after the write, so the sync effect never fires —
  // without an explicit clear the token sits in the box, hiding the placeholder
  // that is the only signal anything was saved.
  it('clears itself afterwards, so the placeholder can speak again', () => {
    const { input } = renderRow();
    fireEvent.change(input, { target: { value: 'tok_123' } });
    fireEvent.blur(input);
    expect(input.value).toBe('');
  });

  it('does not re-send on a second blur', () => {
    const { write, input } = renderRow();
    fireEvent.change(input, { target: { value: 'tok_123' } });
    fireEvent.blur(input);
    fireEvent.blur(input);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('never renders a stored value, because it is never given one', () => {
    const { input } = renderRow();
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Not set');
  });
});
