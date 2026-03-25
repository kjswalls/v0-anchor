'use client';

import { useState, useEffect } from 'react';
import { Settings, ChevronDown, Globe, Clock, Calendar, Bell, Palette, Sun, Moon, Keyboard, RotateCcw, Sparkles, User } from 'lucide-react';
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
      <CollapsibleContent>
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

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      setProfileUserId(uid);
      const profile = await getUserProfile(uid);
      setProfileMd(profile ?? '');
    });
  }, [open]);

  const handleSaveProfile = async () => {
    if (!profileUserId) return;
    setProfileSaving(true);
    await saveUserProfile(profileUserId, profileMd);
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };
  const { eodReviewEnabled, eodReviewTime, setEodReviewEnabled, setEodReviewTime } = useEODStore();

  // OpenClaw API key management
  const [anchorApiKey, setAnchorApiKey] = useState<string | null>(null);
  const [anchorApiKeyLoading, setAnchorApiKeyLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    fetch('/api/openclaw/apikey').then(r => r.json()).then(d => setAnchorApiKey(d.apiKey ?? null));
  }, [open]);
  const handleGenerateApiKey = async () => {
    setAnchorApiKeyLoading(true);
    const res = await fetch('/api/openclaw/apikey', { method: 'POST' });
    const d = await res.json();
    setAnchorApiKey(d.apiKey ?? null);
    setAnchorApiKeyLoading(false);
  };
  const {
    provider, setProvider,
    apiKey, setApiKey,
    model, setModel,
    assistantName, setAssistantName,
    personality, setPersonality,
    systemPrompt, setSystemPrompt,
    openclawWebhookUrl, setOpenclawWebhookUrl,
    openclawApiKey, setOpenclawApiKey,
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

            {/* AI Assist */}
            <SettingsSection
              title="AI Assist"
              icon={<Sparkles className="h-4 w-4" />}
            >
              <SettingRow
                label="Morning task check"
                description="A gentle morning nudge if you have tasks left over from yesterday."
              >
                <Switch
                  checked={morningCheckEnabled}
                  onCheckedChange={setMorningCheckEnabled}
                />
              </SettingRow>
            </SettingsSection>

            {/* About Me */}
            <SettingsSection
              title="About Me"
              icon={<User className="h-4 w-4" />}
            >
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Beacon uses this to give you more personalized help.
                </p>
                <Textarea
                  value={profileMd}
                  onChange={(e) => setProfileMd(e.target.value)}
                  placeholder={"Name: Alex\nFocus: Product design, side projects\nGoals: Ship my app by Q2"}
                  rows={4}
                  className="text-xs resize-none"
                />
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handleSaveProfile}
                  disabled={profileSaving || !profileUserId}
                >
                  {profileSaved ? 'Saved!' : profileSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </SettingsSection>

            {/* End of Day Review */}
            <SettingsSection
              title="End of Day Review"
              icon={<Moon className="h-4 w-4" />}
            >
              <p className="text-xs text-muted-foreground -mt-1 mb-1">
                A gentle daily check-in to celebrate wins and carry forward what&apos;s unfinished.
              </p>
              <SettingRow label="Enable end of day review" description="Show a review prompt each evening">
                <Switch
                  checked={eodReviewEnabled}
                  onCheckedChange={setEodReviewEnabled}
                />
              </SettingRow>
              <SettingRow
                label="Review time"
                description="When to prompt the review (your local time)"
                disabled={!eodReviewEnabled}
              >
                <Input
                  type="time"
                  value={eodReviewTime}
                  onChange={(e) => setEodReviewTime(e.target.value)}
                  className="w-28 h-8 text-xs"
                  disabled={!eodReviewEnabled}
                />
              </SettingRow>
            </SettingsSection>

            {/* AI Assistant */}
            <SettingsSection
              title="AI Assistant"
              icon={<Sparkles className="h-4 w-4" />}
            >
              <SettingRow label="Provider" description="Which AI service powers the assistant">
                <Select value={provider} onValueChange={(v) => setProvider(v as AIProvider)}>
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (disabled)</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="openclaw">OpenClaw</SelectItem>
                    <SelectItem value="anthropic" disabled>Anthropic (coming soon)</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              {provider === 'openai' && (
                <SettingRow label="API Key" description="Your OpenAI API key (stored locally only)">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-44 h-8 text-xs"
                  />
                </SettingRow>
              )}

              {provider === 'openai' && (
                <SettingRow label="Model" description="Which OpenAI model to use">
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                      <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                      <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
              )}

              {provider === 'openclaw' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground">OpenClaw Webhook URL</Label>
                    <Input
                      type="url"
                      value={openclawWebhookUrl}
                      onChange={(e) => setOpenclawWebhookUrl(e.target.value)}
                      placeholder="https://your-instance.ts.net/webhook/anchor"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground">API Key</Label>
                    <Input
                      type="password"
                      value={openclawApiKey}
                      onChange={(e) => setOpenclawApiKey(e.target.value)}
                      placeholder="Optional auth token"
                      className="h-8 text-xs"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your OpenClaw agent will respond using its own memory and personality. Your tasks, habits, and projects are shared automatically as context.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs text-foreground">Your Anchor API Key</Label>
                    <p className="text-xs text-muted-foreground">Paste this into your OpenClaw plugin config so it can access your data.</p>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={anchorApiKey ?? '—'}
                        className="h-8 text-xs font-mono flex-1 bg-muted"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs shrink-0"
                        onClick={() => anchorApiKey && navigator.clipboard.writeText(anchorApiKey)}
                        disabled={!anchorApiKey}
                      >
                        Copy
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={handleGenerateApiKey}
                      disabled={anchorApiKeyLoading}
                    >
                      {anchorApiKey ? '↺ Regenerate key' : '+ Generate key'}
                    </Button>
                  </div>
                </div>
              )}

              <SettingRow label="Assistant name" description="Name shown in the chat UI">
                <Input
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  placeholder="Beacon"
                  className="w-44 h-8 text-xs"
                />
              </SettingRow>

              <SettingRow label="Personality" description="Tone and style of responses">
                <Select value={personality} onValueChange={(v) => setPersonality(v as typeof personality)}>
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="motivational">Motivational</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              {personality === 'custom' && (
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground">Custom system prompt</Label>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="You are a helpful AI assistant in Anchor..."
                    className="text-xs resize-none min-h-[80px]"
                  />
                </div>
              )}
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
