'use client';

import { useState } from 'react';
import { Settings, ChevronDown, Globe, Clock, Calendar, Bell, Palette, Sun, Moon, Keyboard, RotateCcw } from 'lucide-react';
import { formatBucketHour, type ConfigurableBucketRanges } from '@/lib/planner-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { useKeyboardShortcutsStore, ShortcutBinding, DEFAULT_SHORTCUTS } from '@/lib/keyboard-shortcuts-store';
import { usePlannerStore } from '@/lib/planner-store';

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

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm text-foreground">{label}</Label>
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
  const { compactMode: storeCompactMode, setCompactMode, chillMode, setChillMode, showCurrentTimeIndicator, setShowCurrentTimeIndicator, bucketRanges, setBucketRanges } = usePlannerStore();

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
              <SettingRow label="Language" description="Choose your preferred language">
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

              <SettingRow label="Time format" description="How times are displayed">
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
              <SettingRow label="Enable notifications" description="Receive reminders and alerts">
                <Switch 
                  checked={notificationsEnabled} 
                  onCheckedChange={setNotificationsEnabled}
                />
              </SettingRow>

              <SettingRow label="Habit reminders" description="Get reminded about daily habits">
                <Switch 
                  checked={habitReminders} 
                  onCheckedChange={setHabitReminders}
                  disabled={!notificationsEnabled}
                />
              </SettingRow>

              <SettingRow label="Task reminders" description="Get reminded about upcoming tasks">
                <Switch 
                  checked={taskReminders} 
                  onCheckedChange={setTaskReminders}
                  disabled={!notificationsEnabled}
                />
              </SettingRow>

              <SettingRow label="Sound effects" description="Play sounds for notifications">
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
              <SettingRow label="Theme" description="Choose your preferred theme">
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

              <SettingRow label="Show completed tasks" description="Display completed tasks in timeline">
                <Switch 
                  checked={showCompleted} 
                  onCheckedChange={setShowCompleted}
                />
              </SettingRow>

              <SettingRow label="Animations" description="Enable smooth transitions">
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

            {/* Calendar */}
            <SettingsSection 
              title="Calendar" 
              icon={<Calendar className="h-4 w-4" />}
            >
              <SettingRow label="Week starts on" description="First day of the week">
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

              <SettingRow label="Default view" description="View shown when app opens">
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

              <SettingRow label="Default time bucket" description="Where new tasks are placed">
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

              {/* Bucket time ranges — buckets are contiguous; adjusting a boundary shifts both adjacent buckets */}
              {(() => {
                // The three adjustable boundaries are:
                //   morningStart  : where Morning begins
                //   morningEnd    : end of Morning = start of Afternoon
                //   afternoonEnd  : end of Afternoon = start of Evening
                //   eveningEnd    : end of Evening (may cross midnight, max 30 = 6am next day)
                const { morning, afternoon, evening } = bucketRanges;

                const update = (field: 'morningStart' | 'morningEnd' | 'afternoonEnd' | 'eveningEnd', val: number) => {
                  const next = { ...bucketRanges };
                  if (field === 'morningStart') {
                    next.morning = { ...morning, start: val };
                  } else if (field === 'morningEnd') {
                    // morning end = afternoon start
                    next.morning = { ...morning, end: val };
                    next.afternoon = { ...afternoon, start: val };
                  } else if (field === 'afternoonEnd') {
                    // afternoon end = evening start
                    next.afternoon = { ...afternoon, end: val };
                    next.evening = { ...evening, start: val };
                  } else {
                    next.evening = { ...evening, end: val };
                  }
                  setBucketRanges(next);
                };

                const boundaryRow = (
                  label: string,
                  description: string,
                  value: number,
                  field: 'morningStart' | 'morningEnd' | 'afternoonEnd' | 'eveningEnd',
                  maxHour = 24,
                ) => (
                  <SettingRow key={field} label={label} description={description}>
                    <Select
                      value={String(value)}
                      onValueChange={(v) => update(field, Number(v))}
                    >
                      <SelectTrigger className="w-24 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: maxHour + 1 }, (_, i) => i).map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {formatBucketHour(h)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                );

                return (
                  <>
                    {boundaryRow('Morning starts', 'When the Morning bucket begins', morning.start, 'morningStart')}
                    {boundaryRow('Afternoon starts', 'End of Morning / start of Afternoon', morning.end, 'morningEnd')}
                    {boundaryRow('Evening starts', 'End of Afternoon / start of Evening', afternoon.end, 'afternoonEnd')}
                    {boundaryRow('Evening ends', 'End of Evening (can cross midnight)', evening.end, 'eveningEnd', 30)}
                  </>
                );
              })()}
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
