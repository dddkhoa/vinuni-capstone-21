'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';

interface SuggestedActionsProps {
  chatId: string;
  append: UseChatHelpers['append'];
  selectedVisibilityType: VisibilityType;
}

function PureSuggestedActions({ chatId, append }: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: 'What masters degrees',
      label: 'at VinUni?',
      action: 'What masters degrees are available at VinUni?',
    },
    {
      title: 'What are some companies',
      label: `partners of VinUniversity?`,
      action: `What are some companies that are partners of VinUniversity?`,
    },
    {
      title: 'Who was the Vice Provost',
      label: `in 2023?`,
      action: `Who was the Vice Provost in 2023?`,
    },
    {
      title: 'What are the main research areas',
      label: 'in CAS?',
      action: 'What are the main research areas for CAS?',
    },
  ];

  return (
    <div
      data-testid="suggested-actions"
      className="grid sm:grid-cols-2 gap-2 w-full"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? 'hidden sm:block' : 'block'}
        >
          <Button
            variant="ghost"
            onClick={async () => {
              window.history.replaceState({}, '', `/chat/${chatId}`);

              append({
                role: 'user',
                content: suggestedAction.action,
              });
            }}
            className="text-left border border-vinuni-blue/20 hover:border-vinuni-blue/40 hover:bg-vinuni-blue/5 rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start transition-colors"
          >
            <span className="font-medium text-vinuni-blue">
              {suggestedAction.title}
            </span>
            <span className="text-muted-foreground">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;

    return true;
  },
);
