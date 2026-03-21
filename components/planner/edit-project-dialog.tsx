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
import type { Project, TimeBucket, RepeatFrequency } from '@/lib/types';
import { EMOJI_OPTIONS, REPEAT_FREQUENCY_LABELS } from '@/lib/types';
import { cn } from '@/lib/utils';

interface EditProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIME_BUCKETS: { value: TimeBucket; label: string }[] = [
  { value: 'morning', label: 'Morning (5am - 12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm - 5pm)' },
  { value: 'evening', label: 'Evening (5pm - 12am)' },
];

const REPEAT_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: 'none', label: 'No repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'weekly', label: 'Weekly' },
];

export function EditProjectDialog({ project, open, onOpenChange }: EditProjectDialogProps) {
  const { updateProject } = usePlannerStore();
  
  const [emoji, setEmoji] = useState(project?.emoji || '📋');
  const [hasTimeBlock, setHasTimeBlock] = useState(false);
  const [timeBucket, setTimeBucket] = useState<TimeBucket>('morning');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('daily');

  // Reset form when project changes
  useEffect(() => {
    if (project) {
      setEmoji(project.emoji);
      setHasTimeBlock(!!project.startTime && !!project.timeBucket);
      setTimeBucket(project.timeBucket || 'morning');
      setStartTime(project.startTime || '09:00');
      setDuration(project.duration || 60);
      setRepeatFrequency(project.repeatFrequency || 'daily');
    }
  }, [project]);

  const handleSave = () => {
    if (!project) return;
    
    updateProject(project.name, {
      emoji,
      timeBucket: hasTimeBlock ? timeBucket : undefined,
      startTime: hasTimeBlock ? startTime : undefined,
      duration: hasTimeBlock ? duration : undefined,
      repeatFrequency: hasTimeBlock ? repeatFrequency : undefined,
    });
    
    onOpenChange(false);
  };

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card">
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
                Reserve time daily for this project
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
                <Select value={timeBucket} onValueChange={(v) => setTimeBucket(v as TimeBucket)}>
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
                <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hours</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                    <SelectItem value="180">3 hours</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                  </SelectContent>
                </Select>
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
