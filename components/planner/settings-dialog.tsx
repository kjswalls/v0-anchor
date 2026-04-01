'use client';

import { useState, useEffect } from 'react';
import { Settings, ChevronDown, Globe, Calendar, Bell, Palette, Sun, Keyboard, Sparkles, ExternalLink, RotateCw, MessageSquarePlus } from 'lucide-react';
import { usePushSubscription } from '@/hooks/use-push-subscription';
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
import { usePlannerStore } from '@/lib/planner-store';
import { useMorningStore } from '@/lib/morning-store';
import { useEODStore } from '@/lib/eod-store';
import { useAISettingsStore, AIProvider } from '@/lib/ai-settings-store';
import { useSidebarStore } from '@/lib/sidebar-store';
import { saveSettings } from '@/lib/settings-service';
import { useTheme } from 'next-themes';
import { useIsMobile } from '@/components/ui/use-mobile';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenKeyboardShortcuts?: () => void;
  onReplayTour?: () => void;
  onReportBug?: () => void;
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

function SettingRow({ label, description, children, disabled, badge }: { label: string; description?: string; children: React.ReactNode; disabled?: boolean; badge?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", disabled && "opacity-50 pointer-events-none")}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-foreground">{label}</Label>
          {disabled && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30">
              {badge ?? 'Coming soon'}
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


export function SettingsDialog({ open, onOpenChange, onOpenKeyboardShortcuts, onReplayTour, onReportBug }: SettingsDialogProps) {
  // These would be connected to a settings store in a full implementation
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [habitReminders, setHabitReminders] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, permissionState, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushSubscription();
  const { compactMode: storeCompactMode, setCompactMode, chillMode, setChillMode, showCurrentTimeIndicator, setShowCurrentTimeIndicator, userId, showCompletedTasks, setShowCompletedTasks, animationsEnabled, setAnimationsEnabled, weekStartDay, setWeekStartDay, defaultView, setDefaultView, defaultTimeBucket, setDefaultTimeBucket, timeFormat, setTimeFormat } = usePlannerStore();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const { morningCheckEnabled, setMorningCheckEnabled } = useMorningStore();
  useEODStore();

  // Auto-subscribe to push when morning check is enabled
  useEffect(() => {
    if (morningCheckEnabled && pushSupported && !pushSubscribed && permissionState === 'granted') {
      subscribePush();
    }
  }, [morningCheckEnabled, pushSupported, pushSubscribed, permissionState, subscribePush]);

  const {
    provider, setProvider,
    apiKey, setApiKey,
    model, setModel,
    personality, setPersonality,
    systemPrompt, setSystemPrompt,
  } = useAISettingsStore();

  const {
    leftSidebarHoverEnabled,
    rightSidebarHoverEnabled,
    setLeftSidebarHoverEnabled,
    setRightSidebarHoverEnabled,
  } = useSidebarStore();

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
            {/* Time Format */}
            <SettingsSection
              title="Time Format"
              icon={<Globe className="h-4 w-4" />}
              defaultOpen={true}
            >
              <SettingRow label="Time format" description="How times are displayed">
                <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v as '12h' | '24h')}>
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
              {!pushSupported ? (
                <p className="text-xs text-muted-foreground">
                  Push notifications are not supported in this browser.
                </p>
              ) : permissionState === 'denied' ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    Push notifications are blocked. Enable them in your browser settings, then reload.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => alert(`State: ${permissionState}\nSupported: ${pushSupported}\nVAPID: ${process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? 'Yes' : 'No'}`)}>Debug iOS State</Button>
                  <Button variant="default" size="sm" onClick={async () => {
                    try {
                      alert('1. Requesting...');
                      const p = await Notification.requestPermission();
                      alert('2. Permission: ' + p);
                      if (p === 'granted') {
                        alert('3. Subscribing push...');
                        await subscribePush();
                        alert('4. Done subscribing!');
                      }
                    } catch(err: any) {
                      alert('Native click error: ' + err.message);
                    }
                  }}>Force Request (Fix iOS Bug)</Button>
                </div>
              ) : (
                <SettingRow
                  label="Push notifications"
                  description={
                    pushSubscribed
                      ? 'You will receive push notifications from Anchor'
                      : 'Enable to receive reminders and alerts'
                  }
                >
                  <Button 
                    variant={pushSubscribed ? "outline" : "default"} 
                    size="sm" 
                    onClick={async () => {
                      try {
                        if (pushSubscribed) await unsubscribePush();
                        else await subscribePush();
                      } catch (err: any) {
                        alert(`Push Error: ${err.message || err}`);
                      }
                    }}
                  >
                    {pushSubscribed ? 'Disable' : 'Enable'}
                  </Button>
                </SettingRow>
              )}

              <SettingRow label="Habit reminders" description="Get reminded about daily habits" disabled badge="Coming soon">
                <Switch checked={habitReminders} onCheckedChange={setHabitReminders} />
              </SettingRow>

              <SettingRow label="Task reminders" description="Get reminded about upcoming tasks" disabled badge="Coming soon">
                <Switch checked={taskReminders} onCheckedChange={setTaskReminders} />
              </SettingRow>

              <SettingRow label="Sound effects" description="Play sounds for notifications" disabled badge="Coming soon">
                <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
              </SettingRow>
            </SettingsSection>

            {/* Appearance */}
            <SettingsSection 
              title="Appearance" 
              icon={<Palette className="h-4 w-4" />}
            >
              <SettingRow label="Theme" description="Choose your preferred theme">
                <Select value={theme ?? 'system'} onValueChange={(v) => {
                  setTheme(v);
                  if (userId) saveSettings(userId, { theme: v });
                }}>
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

              {!isMobile && (
                <SettingRow label="Compact mode" description="Fit more into the timeline with reduced spacing">
                  <Switch 
                    checked={storeCompactMode} 
                    onCheckedChange={setCompactMode}
                  />
                </SettingRow>
              )}

              {!isMobile && (
                <SettingRow label="Chill mode" description="Hide extra UI elements until hovered for a calmer look">
                  <Switch 
                    checked={chillMode} 
                    onCheckedChange={setChillMode}
                  />
                </SettingRow>
              )}

              <SettingRow label="Show completed tasks" description="Display completed tasks in timeline">
                <Switch
                  checked={showCompletedTasks}
                  onCheckedChange={setShowCompletedTasks}
                />
              </SettingRow>

              <SettingRow label="Current time indicator" description="Show a glowing line at the current time in Day and Week views">
                <Switch 
                  checked={showCurrentTimeIndicator} 
                  onCheckedChange={setShowCurrentTimeIndicator}
                />
              </SettingRow>

              {!isMobile && (
                <SettingRow label="Show tasks sidebar on hover" description="Reveal the left sidebar when hovering the left edge (when collapsed)">
                  <Switch
                    checked={leftSidebarHoverEnabled}
                    onCheckedChange={setLeftSidebarHoverEnabled}
                  />
                </SettingRow>
              )}

              {!isMobile && (
                <SettingRow label="Show chat sidebar on hover" description="Reveal the right sidebar when hovering the right edge (when collapsed)">
                  <Switch
                    checked={rightSidebarHoverEnabled}
                    onCheckedChange={setRightSidebarHoverEnabled}
                  />
                </SettingRow>
              )}
            </SettingsSection>

            {/* Keyboard Shortcuts */}
            {!isMobile && (
              <button
                className="flex items-center justify-between w-full px-4 py-3 hover:bg-accent/50 rounded-lg transition-colors"
                onClick={() => {
                  onOpenChange(false);
                  onOpenKeyboardShortcuts?.();
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-muted-foreground"><Keyboard className="h-4 w-4" /></div>
                  <span className="text-sm font-medium text-foreground">Keyboard Shortcuts</span>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}

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

            </SettingsSection>

            {/* Calendar */}
            <SettingsSection
              title="Calendar"
              icon={<Calendar className="h-4 w-4" />}
            >
              {!isMobile && (
                <SettingRow label="Week starts on" description="First day of the week">
                  <Select value={weekStartDay} onValueChange={(v) => setWeekStartDay(v as 'sunday' | 'monday' | 'saturday')}>
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
              )}

              {!isMobile && (
                <SettingRow label="Default view" description="View shown when app opens">
                  <Select value={defaultView} onValueChange={(v) => setDefaultView(v as 'day' | 'week')}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day view</SelectItem>
                      <SelectItem value="week">Week view</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
              )}

              <SettingRow label="Default time bucket" description="Where new tasks are placed">
                <Select value={defaultTimeBucket} onValueChange={(v) => setDefaultTimeBucket(v as any)}>
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

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Help & Feedback</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={onReportBug}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Share feedback
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                onOpenChange(false);
                onReplayTour?.();
              }}
            >
              <RotateCw className="h-3 w-3" />
              Replay onboarding tour
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
