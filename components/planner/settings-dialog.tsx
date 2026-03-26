'use client';

import { useState, useEffect } from 'react';
import { Settings, ChevronDown, Globe, Clock, Calendar, Bell, Palette, Sun, Keyboard, RotateCcw, Sparkles, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useKeyboardShortcutsStore, ShortcutBinding, DEFAULT_SHORTCUTS } from '@/lib/keyboard-shortcuts-store';
import { usePlannerStore } from '@/lib/planner-store';
import { useMorningStore } from '@/lib/morning-store';
import { createClient } from '@/lib/supabase';
import { getUserProfile, saveUserProfile } from '@/lib/user-profile';
import { useEODStore } from '@/lib/eod-store';
import { useAISettingsStore, AIProvider } from '@/lib/ai-settings-store';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function SettingsSection({ title, icon, children, defaultOpen = false }: SettingsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/50 rounded-lg transition-colors">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">{icon}</div>
            <span className="text-sm font-medium text-foreground">{title}</span>
          </div>
          <ChevronDown className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:overflow-visible">
        <div className="px-4 pb-4 pt-2 space-y-4 ml-7">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SettingRow({ label, description, children, disabled }: { label: string; description?: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", disabled && "opacity-50 pointer-events-none")}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-foreground">{label}</Label>
          {disabled && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30">
              Coming soon
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

const MODIFIER_LABELS: Record<string, string> = {
  'ctrl': 'Ctrl',
  'meta': '⌘',
  'shift': 'Shift',
  'alt': 'Alt',
};

function ShortcutRow({ binding }: { binding: ShortcutBinding }) {
  const { updateShortcut } = useKeyboardShortcutsStore();
  const [recording, setRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

  const handleStartRecording = () => {
    setRecording(true);
    setRecordedKeys([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    // Ignore bare modifier presses
    if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;

    // Build the set of keys currently pressed
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.metaKey) keys.push('meta');
    if (e.shiftKey) keys.push('shift');
    if (e.altKey) keys.push('alt');
    
    const normalizedKey = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if (!['ctrl', 'meta', 'shift', 'alt'].includes(normalizedKey)) {
      keys.push(normalizedKey);
    }

    // Limit to 3 keys max
    if (keys.length <= 3) {
      setRecordedKeys(keys.sort());
    }
  };

  const handleKeyUp = () => {
    if (!recording || recordedKeys.length === 0) return;
    // Save and stop recording when user releases keys
    updateShortcut(binding.id, recordedKeys);
    setRecording(false);
    setRecordedKeys([]);
  };

  const displayKeys = binding.keys.map((key) => {
    if (key === 'space') return 'Space';
    return MODIFIER_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
  });

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5 flex-1">
        <p className="text-sm text-foreground">{binding.label}</p>
        <p className="text-xs text-muted-foreground">{binding.description}</p>
      </div>
      <button
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => {
          if (recording) {
            setRecording(false);
            setRecordedKeys([]);
          }
        }}
        onClick={handleStartRecording}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-mono transition-colors outline-none min-w-[100px] justify-center flex-wrap',
          recording
            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
            : 'border-border bg-muted text-foreground hover:border-primary/50'
        )}
      >
        {recording ? (
          <span className="animate-pulse text-primary">Recording...</span>
        ) : displayKeys.length === 0 ? (
          <span className="text-muted-foreground">No shortcut</span>
        ) : (
          displayKeys.map((key, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1">+</span>}
              {key}
            </span>
          ))
        )}
      </button>
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  // These would be connected to a settings store in a full implementation
  const [language, setLanguage] = useState('en');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [habitReminders, setHabitReminders] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [compactMode, setCompactModeLocal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [weekStartDay, setWeekStartDay] = useState('sunday');
  const [theme, setTheme] = useState('system');
  const { shortcuts, resetShortcuts } = useKeyboardShortcutsStore();
  const { compactMode: storeCompactMode, setCompactMode, chillMode, setChillMode, showCurrentTimeIndicator, setShowCurrentTimeIndicator } = usePlannerStore();
  const { morningCheckEnabled, setMorningCheckEnabled } = useMorningStore();
  const [profileMd, setProfileMd] = useState('');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProfileMd(''); // reset while loading
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) { console.warn('[Settings] No authenticated user found'); return; }
      setProfileUserId(uid);
      const profile = await getUserProfile(uid);
      setProfileMd(profile ?? '');
    }).catch((err) => console.error('[Settings] Failed to load profile:', err));
  }, [open]);

  const handleSaveProfile = async () => {
    // If userId not loaded yet, try one more time
    let uid = profileUserId;
    if (!uid) {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      if (uid) setProfileUserId(uid);
    }
    if (!uid) { console.error('[Settings] Cannot save — no user ID'); return; }
    setProfileSaving(true);
    setProfileError(null);
    try {
      await saveUserProfile(uid, profileMd);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Settings] Failed to save profile:', msg);
      setProfileError(msg);
    } finally {
      setProfileSaving(false);
    }
  };
  const { eodReviewEnabled, eodReviewTime, setEodReviewEnabled, setEodReviewTime } = useEODStore();

  // OpenClaw API key management
  const [anchorApiKey, setAnchorApiKey] = useState<string | null>(null);
  const [anchorApiKeyLoading, setAnchorApiKeyLoading] = useState(false);
  const [anchorApiKeyError, setAnchorApiKeyError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setAnchorApiKeyError(null);
    fetch('/api/openclaw/apikey')
      .then(r => r.json())
      .then(d => setAnchorApiKey(d.apiKey ?? null))
      .catch(() => setAnchorApiKeyError('Failed to load API key'));
  }, [open]);
  const handleGenerateApiKey = async () => {
    setAnchorApiKeyLoading(true);
    setAnchorApiKeyError(null);
    try {
      const res = await fetch('/api/openclaw/apikey', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to generate key');
      setAnchorApiKey(d.apiKey ?? null);
    } catch (err) {
      setAnchorApiKeyError((err as Error).message);
    } finally {
      setAnchorApiKeyLoading(false);
    }
  };
  const {
    provider, setProvider,
    apiKey, setApiKey,
    model, setModel,
    assistantName,
    personality, setPersonality,
    systemPrompt, setSystemPrompt,
    openclawWebhookUrl, setOpenclawWebhookUrl,
    openclawApiKey, setOpenclawApiKey,
    openclawAgentName, setOpenclawAgentName,
  } = useAISettingsStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure your app preferences including language, time format, notifications, and appearance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <div className="space-y-1 py-2">
            {/* Language & Region */}
            <SettingsSection 
              title="Language & Region" 
              icon={<Globe className="h-4 w-4" />}
              defaultOpen={true}
            >
              <SettingRow label="Language" description="Choose your preferred language" disabled>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Time format" description="How times are displayed" disabled>
                <Select value={timeFormat} onValueChange={setTimeFormat}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                    <SelectItem value="24h">24-hour</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </SettingsSection>

            {/* Notifications */}
            <SettingsSection 
              title="Notifications" 
              icon={<Bell className="h-4 w-4" />}
            >
              <SettingRow label="Enable notifications" description="Receive reminders and alerts" disabled>
                <Switch 
                  checked={notificationsEnabled} 
                  onCheckedChange={setNotificationsEnabled}
                />
              </SettingRow>

              <SettingRow label="Habit reminders" description="Get reminded about daily habits" disabled>
                <Switch 
                  checked={habitReminders} 
                  onCheckedChange={setHabitReminders}
                  disabled={!notificationsEnabled}
                />
              </SettingRow>

              <SettingRow label="Task reminders" description="Get reminded about upcoming tasks" disabled>
                <Switch 
                  checked={taskReminders} 
                  onCheckedChange={setTaskReminders}
                  disabled={!notificationsEnabled}
                />
              </SettingRow>

              <SettingRow label="Sound effects" description="Play sounds for notifications" disabled>
                <Switch 
                  checked={soundEnabled} 
                  onCheckedChange={setSoundEnabled}
                  disabled={!notificationsEnabled}
                />
              </SettingRow>
            </SettingsSection>

            {/* Appearance */}
            <SettingsSection 
              title="Appearance" 
              icon={<Palette className="h-4 w-4" />}
            >
              <SettingRow label="Theme" description="Choose your preferred theme" disabled>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Compact mode" description="Fit more into the timeline with reduced spacing">
                <Switch 
                  checked={storeCompactMode} 
                  onCheckedChange={setCompactMode}
                />
              </SettingRow>

              <SettingRow label="Chill mode" description="Hide extra UI elements until hovered for a calmer look">
                <Switch 
                  checked={chillMode} 
                  onCheckedChange={setChillMode}
                />
              </SettingRow>

              <SettingRow label="Show completed tasks" description="Display completed tasks in timeline" disabled>
                <Switch 
                  checked={showCompleted} 
                  onCheckedChange={setShowCompleted}
                />
              </SettingRow>

              <SettingRow label="Animations" description="Enable smooth transitions" disabled>
                <Switch 
                  checked={animationsEnabled} 
                  onCheckedChange={setAnimationsEnabled}
                />
              </SettingRow>

              <SettingRow label="Current time indicator" description="Show a glowing line at the current time in Day and Week views">
                <Switch 
                  checked={showCurrentTimeIndicator} 
                  onCheckedChange={setShowCurrentTimeIndicator}
                />
              </SettingRow>
            </SettingsSection>

            {/* Keyboard Shortcuts */}
            <SettingsSection
              title="Keyboard Shortcuts"
              icon={<Keyboard className="h-4 w-4" />}
            >
              <div className="space-y-4">
                {shortcuts.map((binding) => (
                  <ShortcutRow key={binding.id} binding={binding} />
                ))}
              </div>
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                  onClick={resetShortcuts}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to defaults
                </Button>
              </div>
            </SettingsSection>

            {/* Daily Reviews */}
            <SettingsSection
              title="Daily Reviews"
              icon={<Sun className="h-4 w-4" />}
            >
              <p className="text-xs text-muted-foreground -mt-1 mb-2">
                Shows a banner on your first visit each day if you have leftover tasks.
              </p>
              <SettingRow label="Morning task check" description="Remind me about unfinished tasks from yesterday">
                <Switch checked={morningCheckEnabled} onCheckedChange={setMorningCheckEnabled} />
              </SettingRow>
              {/* EOD review hidden until mobile/PWA push notifications are supported */}
            </SettingsSection>

            {/* AI Assistant */}
            <SettingsSection
              title="AI Assistant"
              icon={<Sparkles className="h-4 w-4" />}
            >
              {/* OpenClaw — primary, shown first */}
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">OpenClaw</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Connect your personal AI agent — uses your memory, personality, and context.</p>
                    </div>
                    <Switch
                      checked={provider === 'openclaw'}
                      onCheckedChange={(v) => setProvider(v ? 'openclaw' : 'none')}
                    />
                  </div>

                  {provider === 'openclaw' && (
                    <div className="space-y-2 pt-1 border-t border-border">
                      <div className="space-y-1">
                        <Label className="text-xs text-foreground">Webhook URL</Label>
                        <Input
                          type="url"
                          value={openclawWebhookUrl}
                          onChange={(e) => setOpenclawWebhookUrl(e.target.value)}
                          placeholder="https://your-instance.ts.net/webhook/anchor"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-foreground">API Key</Label>
                        <Input
                          type="password"
                          value={openclawApiKey}
                          onChange={(e) => setOpenclawApiKey(e.target.value)}
                          placeholder="Optional auth token"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-foreground">Agent name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                          value={openclawAgentName}
                          onChange={(e) => setOpenclawAgentName(e.target.value)}
                          placeholder="e.g. Guma"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1 pt-1 border-t border-border">
                        <Label className="text-xs text-foreground">Your Anchor API Key</Label>
                        <p className="text-xs text-muted-foreground">Paste this into your OpenClaw plugin config.</p>
                        <div className="flex items-center gap-2">
                          <Input readOnly value={anchorApiKey ?? '—'} className="h-8 text-xs font-mono flex-1 bg-muted" />
                          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
                            onClick={() => anchorApiKey && navigator.clipboard.writeText(anchorApiKey)}
                            disabled={!anchorApiKey}>
                            Copy
                          </Button>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={handleGenerateApiKey} disabled={anchorApiKeyLoading}>
                          {anchorApiKeyLoading ? 'Generating…' : anchorApiKey ? '↺ Regenerate' : '+ Generate key'}
                        </Button>
                        {anchorApiKeyError && <p className="text-xs text-destructive">{anchorApiKeyError}</p>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Beacon fallback — secondary */}
                <div className="rounded-lg border border-border px-3 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">Beacon <span className="text-muted-foreground font-normal">(OpenAI fallback)</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">Use when OpenClaw isn't connected.</p>
                    </div>
                    <Switch
                      checked={provider === 'openai'}
                      onCheckedChange={(v) => setProvider(v ? 'openai' : 'none')}
                      disabled={provider === 'openclaw'}
                    />
                  </div>

                  {provider === 'openai' && (
                    <div className="space-y-2 pt-1 border-t border-border">
                      <SettingRow label="API Key" description="Stored locally only">
                        <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                          placeholder="sk-..." className="w-44 h-8 text-xs" />
                      </SettingRow>
                      <SettingRow label="Model" description="">
                        <Select value={model} onValueChange={setModel}>
                          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                            <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                            <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                          </SelectContent>
                        </Select>
                      </SettingRow>
                      <SettingRow label="Personality" description="">
                        <Select value={personality} onValueChange={(v) => setPersonality(v as typeof personality)}>
                          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="professional">Professional</SelectItem>
                            <SelectItem value="motivational">Motivational</SelectItem>
                            <SelectItem value="minimal">Minimal</SelectItem>
                          </SelectContent>
                        </Select>
                      </SettingRow>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-3 mt-1 space-y-2">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-xs font-medium text-foreground">About Me</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Helps Beacon give you more personalized responses.
                </p>
                <Textarea
                  value={profileMd}
                  onChange={(e) => setProfileMd(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  placeholder={"Name: Kirby\nFocus: Building Anchor\nGoals: Launch by Q2"}
                  rows={3}
                  className="text-xs resize-none pointer-events-auto relative z-10"
                />
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={(e) => { e.stopPropagation(); handleSaveProfile(); }}
                  disabled={profileSaving}
                >
                  {profileSaved ? 'Saved! ✓' : profileSaving ? 'Saving…' : 'Save'}
                </Button>
                {profileError && (
                  <p className="text-xs text-destructive mt-1">{profileError}</p>
                )}
              </div>
            </SettingsSection>

            {/* Calendar */}
            <SettingsSection
              title="Calendar"
              icon={<Calendar className="h-4 w-4" />}
            >
              <SettingRow label="Week starts on" description="First day of the week" disabled>
                <Select value={weekStartDay} onValueChange={setWeekStartDay}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sunday">Sunday</SelectItem>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="saturday">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Default view" description="View shown when app opens" disabled>
                <Select defaultValue="day">
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day view</SelectItem>
                    <SelectItem value="week">Week view</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Default time bucket" description="Where new tasks are placed" disabled>
                <Select defaultValue="anytime">
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anytime">Anytime</SelectItem>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </SettingsSection>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
