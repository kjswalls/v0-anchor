import type { AtlasNode } from './atlas-store';

// Project colors that work in both light and dark themes
export const PROJECT_COLORS = {
  work: 'oklch(0.65 0.15 250)', // Blue
  wellness: 'oklch(0.65 0.15 160)', // Teal/Green
  personal: 'oklch(0.65 0.12 320)', // Pink/Purple
  learning: 'oklch(0.7 0.15 85)', // Yellow/Gold
  creative: 'oklch(0.65 0.15 25)', // Orange/Red
  social: 'oklch(0.6 0.15 280)', // Purple
};

// Generate mock atlas nodes from projects
// In production, this would derive from the planner store
export function generateMockAtlasNodes(): AtlasNode[] {
  return [
    {
      id: 'work',
      name: 'Work',
      emoji: '💼',
      color: PROJECT_COLORS.work,
      activityLevel: 0.85,
      taskCount: 12,
      completedCount: 8,
      children: [
        {
          id: 'work-meetings',
          name: 'Meetings',
          emoji: '📅',
          color: PROJECT_COLORS.work,
          activityLevel: 0.6,
          taskCount: 4,
          completedCount: 2,
          parentId: 'work',
        },
        {
          id: 'work-development',
          name: 'Development',
          emoji: '💻',
          color: PROJECT_COLORS.work,
          activityLevel: 0.95,
          taskCount: 6,
          completedCount: 5,
          parentId: 'work',
        },
        {
          id: 'work-admin',
          name: 'Admin',
          emoji: '📋',
          color: PROJECT_COLORS.work,
          activityLevel: 0.3,
          taskCount: 2,
          completedCount: 1,
          parentId: 'work',
        },
      ],
    },
    {
      id: 'wellness',
      name: 'Wellness',
      emoji: '🧘',
      color: PROJECT_COLORS.wellness,
      activityLevel: 0.7,
      taskCount: 8,
      completedCount: 5,
      children: [
        {
          id: 'wellness-exercise',
          name: 'Exercise',
          emoji: '🏃',
          color: PROJECT_COLORS.wellness,
          activityLevel: 0.8,
          taskCount: 4,
          completedCount: 3,
          parentId: 'wellness',
        },
        {
          id: 'wellness-meditation',
          name: 'Meditation',
          emoji: '🧘',
          color: PROJECT_COLORS.wellness,
          activityLevel: 0.5,
          taskCount: 4,
          completedCount: 2,
          parentId: 'wellness',
        },
      ],
    },
    {
      id: 'personal',
      name: 'Personal',
      emoji: '🏠',
      color: PROJECT_COLORS.personal,
      activityLevel: 0.45,
      taskCount: 6,
      completedCount: 2,
    },
    {
      id: 'learning',
      name: 'Learning',
      emoji: '📚',
      color: PROJECT_COLORS.learning,
      activityLevel: 0.6,
      taskCount: 5,
      completedCount: 3,
    },
    {
      id: 'creative',
      name: 'Creative',
      emoji: '🎨',
      color: PROJECT_COLORS.creative,
      activityLevel: 0.25,
      taskCount: 3,
      completedCount: 0,
    },
  ];
}

// Mock tasks for selected project
export interface MockTask {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueTime?: string;
}

export function getMockTasksForProject(projectId: string): MockTask[] {
  const tasksByProject: Record<string, MockTask[]> = {
    'work': [
      { id: 't1', title: 'Review quarterly report', completed: true, priority: 'high' },
      { id: 't2', title: 'Team standup meeting', completed: true, priority: 'medium', dueTime: '10:00 AM' },
      { id: 't3', title: 'Code review for PR #234', completed: false, priority: 'high' },
      { id: 't4', title: 'Update project documentation', completed: false, priority: 'low' },
    ],
    'work-meetings': [
      { id: 't5', title: '1:1 with manager', completed: true, priority: 'medium', dueTime: '2:00 PM' },
      { id: 't6', title: 'Sprint planning', completed: false, priority: 'high', dueTime: '3:00 PM' },
    ],
    'work-development': [
      { id: 't7', title: 'Implement Atlas view', completed: true, priority: 'high' },
      { id: 't8', title: 'Fix navigation bug', completed: true, priority: 'high' },
      { id: 't9', title: 'Add unit tests', completed: false, priority: 'medium' },
    ],
    'wellness': [
      { id: 't10', title: 'Morning yoga', completed: true, priority: 'medium', dueTime: '7:00 AM' },
      { id: 't11', title: 'Evening walk', completed: false, priority: 'low', dueTime: '6:00 PM' },
    ],
    'personal': [
      { id: 't12', title: 'Grocery shopping', completed: false, priority: 'medium' },
      { id: 't13', title: 'Call mom', completed: false, priority: 'high' },
    ],
  };
  
  return tasksByProject[projectId] || [
    { id: 'default1', title: 'No tasks yet', completed: false, priority: 'low' },
  ];
}
