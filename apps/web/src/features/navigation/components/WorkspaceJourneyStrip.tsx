import type { JourneyStage } from '../journey-stage';
import { JOURNEY_STAGES, JOURNEY_STAGE_LABELS } from '../journey-stage';
import { useLanguage } from '@/lib/i18n';

export interface WorkspaceJourneyStripProps {
  activeStage: JourneyStage;
}

export function WorkspaceJourneyStrip({ activeStage }: WorkspaceJourneyStripProps) {
  const { t } = useLanguage();
  const activeIndex = JOURNEY_STAGES.indexOf(activeStage);

  return (
    <div
      className="border-t border-border/60 bg-muted/25 px-3 py-1.5"
      data-testid="workspace-journey-strip"
      aria-label={t('Procurement journey progress', 'Procurement journey progress')}
    >
      <ol className="mx-auto flex w-full max-w-lg items-center justify-between gap-1">
        {JOURNEY_STAGES.map((stage, index) => {
          const isComplete = index < activeIndex;
          const isActive = stage === activeStage;
          return (
            <li key={stage} className="flex flex-1 min-w-0 items-center justify-center">
              <span
                className={`flex w-full max-w-[5.5rem] flex-col items-center gap-0.5 rounded-lg px-1 py-0.5 text-center transition ${
                  isActive
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/25'
                    : isComplete
                      ? 'text-foreground/80'
                      : 'text-muted-foreground'
                }`}
                aria-current={isActive ? 'step' : undefined}
                data-testid={`journey-stage-${stage.toLowerCase()}`}
                data-active={isActive ? 'true' : 'false'}
              >
                <span
                  className={`text-[9px] font-black uppercase tracking-wide leading-none ${
                    isActive ? 'text-primary' : ''
                  }`}
                >
                  {index + 1}
                </span>
                <span className="text-[10px] font-bold leading-tight truncate w-full">
                  {t(JOURNEY_STAGE_LABELS[stage], JOURNEY_STAGE_LABELS[stage])}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
