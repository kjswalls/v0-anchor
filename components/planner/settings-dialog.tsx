'use client';

import { useState } from 'react';
import { Settings, ChevronDown, Globe, Clock, Calendar, Bell, Palette } from 'lucide-react';
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

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  // These would be connected to a settings store in a full implementation
  const [language, setLanguage] = useState('en');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [weekStartDay, setWeekStartDay] = useState('sunday');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [habitReminders, setHabitReminders] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border max-h-[85vh] overflow-hidden flex flex-col">
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
              <SettingRow label="Compact mode" description="Reduce spacing for more content">
                <Switch 
                  checked={compactMode} 
                  onCheckedChange={setCompactMode}
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
            </SettingsSection>

            {/* Calendar */}
            <SettingsSection 
              title="Calendar" 
              icon={<Calendar className="h-4 w-4" />}
            >
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
