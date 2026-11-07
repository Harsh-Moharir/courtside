'use client';
import * as RT from '@radix-ui/react-tabs';
import { cn } from './cn';

export const Tabs = RT.Root;
export const TabsContent = RT.Content;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <RT.List className={cn('scrollbar-thin mb-5 flex gap-1 overflow-x-auto rounded-btn border border-border bg-surface p-1', className)}>
      {children}
    </RT.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <RT.Trigger
      value={value}
      className="min-h-[40px] whitespace-nowrap rounded-[10px] px-4 text-sm font-semibold text-muted data-[state=active]:bg-accent data-[state=active]:text-accent-contrast"
    >
      {children}
    </RT.Trigger>
  );
}
