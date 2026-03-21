'use client';

import { useState, useEffect } from 'react';
import { Clock, Calendar, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePlannerStore } from '@/lib/planner-store';
import type { Project, TimeBucket, RepeatFrequency } from '@/lib/planner-types';
import { EMOJI_OPTIONS, WEEKDAY_LABELS } from '@/lib/planner-types';
import { cn } from '@/lib/utils';

interface EditProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIME_BUCKETS: { value: TimeBucket; label: string; defaultTime: string }[] = [
  { value: 'morning', label: 'Morning (5am - 12pm)', defaultTime: '05:00' },
  { value: 'afternoon', label: 'Afternoon (12pm - 5pm)', defaultTime: '12:00' },
  { value: 'evening', label: 'Evening (5pm - 12am)', defaultTime: '17:00' },
];

const REPEAT_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: 'none', label: 'No repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom days' },
];

const DURATION_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
  { value: 'custom', label: 'Custom' },
];

export function EditProjectDialog({ project, open, onOpenChange }: EditProjectDialogProps) {
  const { updateProject } = usePlannerStore();
  
  const [emoji, setEmoji] = useState(project?.emoji || '📋');
  const [hasTimeBlock, setHasTimeBlock] = useState(false);
  const [timeBucket, setTimeBucket] = useState<TimeBucket>('morning');
  const [startTime, setStartTime] = useState('05:00');
  const [duration, setDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState('');
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('daily');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);

  // Reset form when project changes
  useEffect(() => {
    if (project) {
      setEmoji(project.emoji);
      setHasTimeBlock(!!project.startTime && !!project.timeBucket);
      setTimeBucket(project.timeBucket || 'morning');
      setStartTime(project.startTime || '05:00');
      const projectDuration = project.duration || 60;
      setDuration(projectDuration);
      // Check if duration is a standard option
      const isStandard = DURATION_OPTIONS.some(opt => opt.value !== 'custom' && parseInt(opt.value) === projectDuration);
      setIsCustomDuration(!isStandard);
      setCustomDuration(isStandard ? '' : projectDuration.toString());
      setRepeatFrequency(project.repeatFrequency || 'daily');
      setRepeatDays(project.repeatDays || []);
    }
  }, [project]);

  // Update start time when bucket changes
  const handleBucketChange = (newBucket: TimeBucket) => {
    setTimeBucket(newBucket);
    const bucketConfig = TIME_BUCKETS.find(b => b.value === newBucket);
    if (bucketConfig) {
      setStartTime(bucketConfig.defaultTime);
    }
  };

  // Handle duration selection
  const handleDurationChange = (value: string) => {
    if (value === 'custom') {
      setIsCustomDuration(true);
      setCustomDuration(duration.toString());
    } else {
      setIsCustomDuration(false);
      setDuration(parseInt(value));
    }
  };

  // Handle custom duration input
  const handleCustomDurationChange = (value: string) => {
    setCustomDuration(value);
    const parsed = parseInt(value);
    if (!isNaN(parsed) && parsed > 0) {
      setDuration(parsed);
    }
  };

  // Toggle day for custom/weekly repeat
  const toggleDay = (day: number) => {
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter((d) => d !== day));
    } else {
      setRepeatDays([...repeatDays, day].sort());
    }
  };

  const handleSave = () => {
    if (!project) return;
    
    const finalDuration = isCustomDuration ? (parseInt(customDuration) || 60) : duration;
    
    updateProject(project.name, {
      emoji,
      timeBucket: hasTimeBlock ? timeBucket : undefined,
      startTime: hasTimeBlock ? startTime : undefined,
      duration: hasTimeBlock ? finalDuration : undefined,
      repeatFrequency: hasTimeBlock ? repeatFrequency : undefined,
      repeatDays: hasTimeBlock && (repeatFrequency === 'custom' || repeatFrequency === 'weekly') ? repeatDays : undefined,
    });
    
    onOpenChange(false);
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Project</DialogTitle>
          <DialogDescription>
            Configure {project.name} settings and optional time blocking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Emoji selector */}
          <div className="flex items-center gap-4">
            <Label className="w-20 text-sm text-muted-foreground">Icon</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <span className="text-xl">{emoji}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2">
                <div className="grid grid-cols-6 gap-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      className={cn(
                        'w-8 h-8 rounded hover:bg-secondary flex items-center justify-center',
                        emoji === e && 'bg-secondary ring-1 ring-primary'
                      )}
                      onClick={() => setEmoji(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Time block toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Time Block</Label>
              <p className="text-xs text-muted-foreground">
                Reserve time for this project
              </p>
            </div>
            <Switch
              checked={hasTimeBlock}
              onCheckedChange={setHasTimeBlock}
            />
          </div>

          {/* Time block options */}
          {hasTimeBlock && (
            <div className="space-y-4 pl-4 border-l-2 border-primary/20">
              {/* Time bucket */}
              <div className="flex items-center gap-4">
                <Label className="w-20 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 inline mr-1" />
                  Bucket
                </Label>
                <Select value={timeBucket} onValueChange={(v) => handleBucketChange(v as TimeBucket)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_BUCKETS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start time */}
              <div className="flex items-center gap-4">
                <Label className="w-20 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 inline mr-1" />
                  Start
                </Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex-1"
                />
              </div>

              {/* Duration */}
              <div className="flex items-center gap-4">
                <Label className="w-20 text-sm text-muted-foreground">Duration</Label>
                {isCustomDuration ? (
                  <div className="flex-1 flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Minutes"
                      value={customDuration}
                      onChange={(e) => handleCustomDurationChange(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsCustomDuration(false)}
                      className="text-xs text-muted-foreground"
                    >
                      Presets
                    </Button>
                  </div>
                ) : (
                  <Select 
                    value={duration.toString()} 
                    onValueChange={handleDurationChange}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Repeat frequency */}
              <div className="flex items-center gap-4">
                <Label className="w-20 text-sm text-muted-foreground">
                  <Repeat className="h-4 w-4 inline mr-1" />
                  Repeat
                </Label>
                <Select value={repeatFrequency} onValueChange={(v) => setRepeatFrequency(v as RepeatFrequency)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPEAT_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Day selector for weekly or custom repeat */}
              {(repeatFrequency === 'weekly' || repeatFrequency === 'custom') && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    {repeatFrequency === 'weekly' ? 'Repeat on' : 'Select days'}
                  </Label>
                  <div className="flex gap-1">
                    {WEEKDAY_LABELS.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(index)}
                        className={cn(
                          'w-9 h-9 rounded-lg text-xs font-medium transition-colors',
                          repeatDays.includes(index)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
