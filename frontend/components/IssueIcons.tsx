'use client';

import { Check, X } from 'lucide-react';
import type { IssueCheck } from '@/lib/types';

interface IssueIconsProps {
  issues: IssueCheck;
}

export function IssueIcons({ issues }: IssueIconsProps) {
  return (
    <div className="flex gap-1">
      {issues.robots ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <X className="h-4 w-4 text-red-500" />
      )}
      {issues.sitemap ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <X className="h-4 w-4 text-red-500" />
      )}
      {issues.titleDuplicates ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <X className="h-4 w-4 text-red-500" />
      )}
      {issues.descriptionDuplicates ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <X className="h-4 w-4 text-red-500" />
      )}
    </div>
  );
}
