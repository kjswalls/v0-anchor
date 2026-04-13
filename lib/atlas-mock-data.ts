import type { AtlasItem } from './atlas-store';

// Project colors that work in both light and dark themes
export const PROJECT_COLORS = {
  work: 'oklch(0.65 0.15 250)', // Blue
  wellness: 'oklch(0.65 0.15 160)', // Teal/Green
  personal: 'oklch(0.65 0.12 320)', // Pink/Purple
  learning: 'oklch(0.7 0.15 85)', // Yellow/Gold
  creative: 'oklch(0.65 0.15 25)', // Orange/Red
  life: 'oklch(0.65 0.12 200)', // Cyan
  career: 'oklch(0.6 0.15 280)', // Purple
};

// Generate hierarchical atlas data: Meta Projects > Projects > Tasks > Subtasks
export function generateMockAtlasItems(): AtlasItem[] {
  return [
    // Meta Project 1: Life
    {
      id: 'meta-life',
      name: 'Life',
      emoji: '🌟',
      color: PROJECT_COLORS.life,
      type: 'meta_project',
      activityLevel: 0.7,
      taskCount: 14,
      completedCount: 8,
      parentId: null,
      children: [
        // Project: Wellness
        {
          id: 'wellness',
          name: 'Wellness',
          emoji: '🧘',
          color: PROJECT_COLORS.wellness,
          type: 'project',
          activityLevel: 0.7,
          taskCount: 6,
          completedCount: 4,
          parentId: 'meta-life',
          children: [
            {
              id: 'wellness-exercise',
              name: 'Exercise',
              emoji: '🏃',
              color: PROJECT_COLORS.wellness,
              type: 'task',
              activityLevel: 0.8,
              taskCount: 3,
              completedCount: 2,
              parentId: 'wellness',
              children: [
                { id: 'well-ex-run', name: 'Morning run', emoji: '🏃', color: PROJECT_COLORS.wellness, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'wellness-exercise', children: [] },
                { id: 'well-ex-yoga', name: 'Yoga session', emoji: '🧘', color: PROJECT_COLORS.wellness, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'wellness-exercise', children: [] },
                { id: 'well-ex-gym', name: 'Gym workout', emoji: '💪', color: PROJECT_COLORS.wellness, type: 'subtask', activityLevel: 0.4, taskCount: 1, completedCount: 0, parentId: 'wellness-exercise', children: [] },
              ],
            },
            {
              id: 'wellness-nutrition',
              name: 'Nutrition',
              emoji: '🥗',
              color: PROJECT_COLORS.wellness,
              type: 'task',
              activityLevel: 0.6,
              taskCount: 2,
              completedCount: 1,
              parentId: 'wellness',
              children: [
                { id: 'well-nut-meal', name: 'Meal prep', emoji: '🍱', color: PROJECT_COLORS.wellness, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'wellness-nutrition', children: [] },
                { id: 'well-nut-water', name: 'Drink water', emoji: '💧', color: PROJECT_COLORS.wellness, type: 'subtask', activityLevel: 0.5, taskCount: 1, completedCount: 0, parentId: 'wellness-nutrition', children: [] },
              ],
            },
          ],
        },
        // Project: Personal
        {
          id: 'personal',
          name: 'Personal',
          emoji: '🏠',
          color: PROJECT_COLORS.personal,
          type: 'project',
          activityLevel: 0.5,
          taskCount: 5,
          completedCount: 2,
          parentId: 'meta-life',
          children: [
            {
              id: 'personal-errands',
              name: 'Errands',
              emoji: '🛒',
              color: PROJECT_COLORS.personal,
              type: 'task',
              activityLevel: 0.6,
              taskCount: 3,
              completedCount: 1,
              parentId: 'personal',
              children: [
                { id: 'pers-err-grocery', name: 'Grocery shopping', emoji: '🛒', color: PROJECT_COLORS.personal, type: 'subtask', activityLevel: 0.8, taskCount: 1, completedCount: 1, parentId: 'personal-errands', children: [] },
                { id: 'pers-err-bank', name: 'Visit bank', emoji: '🏦', color: PROJECT_COLORS.personal, type: 'subtask', activityLevel: 0.3, taskCount: 1, completedCount: 0, parentId: 'personal-errands', children: [] },
                { id: 'pers-err-post', name: 'Post office', emoji: '📮', color: PROJECT_COLORS.personal, type: 'subtask', activityLevel: 0.2, taskCount: 1, completedCount: 0, parentId: 'personal-errands', children: [] },
              ],
            },
            {
              id: 'personal-family',
              name: 'Family',
              emoji: '👨‍👩‍👧',
              color: PROJECT_COLORS.personal,
              type: 'task',
              activityLevel: 0.4,
              taskCount: 2,
              completedCount: 1,
              parentId: 'personal',
              children: [
                { id: 'pers-fam-call', name: 'Call mom', emoji: '📞', color: PROJECT_COLORS.personal, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'personal-family', children: [] },
                { id: 'pers-fam-gift', name: 'Buy birthday gift', emoji: '🎁', color: PROJECT_COLORS.personal, type: 'subtask', activityLevel: 0.2, taskCount: 1, completedCount: 0, parentId: 'personal-family', children: [] },
              ],
            },
          ],
        },
      ],
    },
    // Meta Project 2: Career
    {
      id: 'meta-career',
      name: 'Career',
      emoji: '🚀',
      color: PROJECT_COLORS.career,
      type: 'meta_project',
      activityLevel: 0.75,
      taskCount: 15,
      completedCount: 10,
      parentId: null,
      children: [
        // Project: Work
        {
          id: 'work',
          name: 'Work',
          emoji: '💼',
          color: PROJECT_COLORS.work,
          type: 'project',
          activityLevel: 0.85,
          taskCount: 12,
          completedCount: 8,
          parentId: 'meta-career',
          children: [
            {
              id: 'work-quarterly-report',
              name: 'Quarterly Report',
              emoji: '📊',
              color: PROJECT_COLORS.work,
              type: 'task',
              activityLevel: 0.9,
              taskCount: 4,
              completedCount: 3,
              parentId: 'work',
              children: [
                { id: 'work-qr-data', name: 'Gather data', emoji: '📈', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'work-quarterly-report', children: [] },
                { id: 'work-qr-draft', name: 'Draft report', emoji: '✍️', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'work-quarterly-report', children: [] },
                { id: 'work-qr-review', name: 'Review with team', emoji: '👥', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 0.8, taskCount: 1, completedCount: 1, parentId: 'work-quarterly-report', children: [] },
                { id: 'work-qr-email', name: 'Email Janice', emoji: '📧', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 0.5, taskCount: 1, completedCount: 0, parentId: 'work-quarterly-report', children: [] },
              ],
            },
            {
              id: 'work-code-review',
              name: 'Code Reviews',
              emoji: '💻',
              color: PROJECT_COLORS.work,
              type: 'task',
              activityLevel: 0.7,
              taskCount: 3,
              completedCount: 2,
              parentId: 'work',
              children: [
                { id: 'work-cr-pr234', name: 'Review PR #234', emoji: '🔍', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'work-code-review', children: [] },
                { id: 'work-cr-pr235', name: 'Review PR #235', emoji: '🔍', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 0.8, taskCount: 1, completedCount: 1, parentId: 'work-code-review', children: [] },
                { id: 'work-cr-pr236', name: 'Review PR #236', emoji: '🔍', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 0.3, taskCount: 1, completedCount: 0, parentId: 'work-code-review', children: [] },
              ],
            },
            {
              id: 'work-meetings',
              name: 'Team Meetings',
              emoji: '📅',
              color: PROJECT_COLORS.work,
              type: 'task',
              activityLevel: 0.6,
              taskCount: 2,
              completedCount: 1,
              parentId: 'work',
              children: [
                { id: 'work-m-standup', name: 'Daily standup', emoji: '🗣️', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'work-meetings', children: [] },
                { id: 'work-m-sprint', name: 'Sprint planning', emoji: '📋', color: PROJECT_COLORS.work, type: 'subtask', activityLevel: 0.4, taskCount: 1, completedCount: 0, parentId: 'work-meetings', children: [] },
              ],
            },
          ],
        },
        // Project: Learning
        {
          id: 'learning',
          name: 'Learning',
          emoji: '📚',
          color: PROJECT_COLORS.learning,
          type: 'project',
          activityLevel: 0.65,
          taskCount: 4,
          completedCount: 2,
          parentId: 'meta-career',
          children: [
            {
              id: 'learning-course',
              name: 'Online Course',
              emoji: '💻',
              color: PROJECT_COLORS.learning,
              type: 'task',
              activityLevel: 0.7,
              taskCount: 2,
              completedCount: 1,
              parentId: 'learning',
              children: [
                { id: 'learn-c-vid', name: 'Watch module 5', emoji: '🎬', color: PROJECT_COLORS.learning, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'learning-course', children: [] },
                { id: 'learn-c-quiz', name: 'Complete quiz', emoji: '✅', color: PROJECT_COLORS.learning, type: 'subtask', activityLevel: 0.4, taskCount: 1, completedCount: 0, parentId: 'learning-course', children: [] },
              ],
            },
            {
              id: 'learning-reading',
              name: 'Reading',
              emoji: '📖',
              color: PROJECT_COLORS.learning,
              type: 'task',
              activityLevel: 0.5,
              taskCount: 2,
              completedCount: 1,
              parentId: 'learning',
              children: [
                { id: 'learn-r-book', name: 'Finish chapter 8', emoji: '📕', color: PROJECT_COLORS.learning, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'learning-reading', children: [] },
                { id: 'learn-r-notes', name: 'Take notes', emoji: '📝', color: PROJECT_COLORS.learning, type: 'subtask', activityLevel: 0.3, taskCount: 1, completedCount: 0, parentId: 'learning-reading', children: [] },
              ],
            },
          ],
        },
      ],
    },
    // Meta Project 3: Creative
    {
      id: 'meta-creative',
      name: 'Creative',
      emoji: '🎨',
      color: PROJECT_COLORS.creative,
      type: 'meta_project',
      activityLevel: 0.4,
      taskCount: 3,
      completedCount: 1,
      parentId: null,
      children: [
        // Project: Art
        {
          id: 'creative',
          name: 'Art & Music',
          emoji: '🎨',
          color: PROJECT_COLORS.creative,
          type: 'project',
          activityLevel: 0.35,
          taskCount: 3,
          completedCount: 1,
          parentId: 'meta-creative',
          children: [
            {
              id: 'creative-art',
              name: 'Art Project',
              emoji: '🖼️',
              color: PROJECT_COLORS.creative,
              type: 'task',
              activityLevel: 0.4,
              taskCount: 2,
              completedCount: 1,
              parentId: 'creative',
              children: [
                { id: 'crea-a-sketch', name: 'Sketch ideas', emoji: '✏️', color: PROJECT_COLORS.creative, type: 'subtask', activityLevel: 1, taskCount: 1, completedCount: 1, parentId: 'creative-art', children: [] },
                { id: 'crea-a-paint', name: 'Start painting', emoji: '🎨', color: PROJECT_COLORS.creative, type: 'subtask', activityLevel: 0.2, taskCount: 1, completedCount: 0, parentId: 'creative-art', children: [] },
              ],
            },
            {
              id: 'creative-music',
              name: 'Music Practice',
              emoji: '🎸',
              color: PROJECT_COLORS.creative,
              type: 'task',
              activityLevel: 0.3,
              taskCount: 1,
              completedCount: 0,
              parentId: 'creative',
              children: [
                { id: 'crea-m-practice', name: 'Practice scales', emoji: '🎵', color: PROJECT_COLORS.creative, type: 'subtask', activityLevel: 0.2, taskCount: 1, completedCount: 0, parentId: 'creative-music', children: [] },
              ],
            },
          ],
        },
      ],
    },
  ];
}

// Get tasks for display in bottom panel
export interface MockTask {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueTime?: string;
}

export function getMockTasksForItem(item: AtlasItem | null): MockTask[] {
  if (!item) return [];
  
  // For meta_projects or projects, show their direct children
  if (item.type === 'meta_project' || item.type === 'project') {
    return item.children.map(child => ({
      id: child.id,
      title: child.name,
      completed: child.completedCount === child.taskCount,
      priority: child.activityLevel > 0.7 ? 'high' : child.activityLevel > 0.4 ? 'medium' : 'low',
    }));
  }
  
  // For tasks, show their subtasks
  if (item.type === 'task') {
    return item.children.map(child => ({
      id: child.id,
      title: child.name,
      completed: child.completedCount === child.taskCount,
      priority: child.activityLevel > 0.7 ? 'high' : child.activityLevel > 0.4 ? 'medium' : 'low',
    }));
  }
  
  // For subtasks, just return the item itself
  return [{
    id: item.id,
    title: item.name,
    completed: item.completedCount === item.taskCount,
    priority: item.activityLevel > 0.7 ? 'high' : item.activityLevel > 0.4 ? 'medium' : 'low',
  }];
}
