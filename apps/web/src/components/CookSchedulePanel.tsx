import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import type { CookScheduleDto } from '../lib/api';
import { formatClockTime, formatTotalMinutes } from '../lib/formatStepTiming';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';

interface CookSchedulePanelProps {
  schedule: CookScheduleDto | null;
}

/**
 * Renders the backward cook schedule: what time to START each dish so everything lands on the
 * table at once. Server already sorted dishes by start time ascending, so this renders them in
 * order without re-sorting — that ordering IS the host's to-do list.
 *
 * A dish with `hasUnstatedDurations` is marked an estimate rather than presented as fact: an
 * unstated step duration counts as zero minutes, which necessarily understates the total, and a
 * silently-short schedule is far worse for a host than a visibly incomplete one.
 */
export const CookSchedulePanel: React.FC<CookSchedulePanelProps> = ({ schedule }) => {
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  if (!schedule) {
    return null;
  }

  const anyEstimated = schedule.recipes.some((r) => r.hasUnstatedDurations);

  return (
    <Card className="border-olive/40 shadow-warm-sm">
      <CardHeader className="flex-row items-center space-x-3 border-b border-olive/30 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-olive/40 bg-olive-light text-olive">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <CardTitle className="font-serif text-lg text-ink">Cook Schedule</CardTitle>
          <CardDescription className="text-xs text-ink-muted">
            Work backwards from serving at {formatClockTime(schedule.serveTimeMinutes)} — start the
            first dish at {formatClockTime(schedule.earliestStartMinutes)}.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {schedule.recipes.length === 0 ? (
          <div className="py-4 text-sm text-ink-muted">
            No dishes to schedule for this guest group.
          </div>
        ) : (
          <>
            <ol className="space-y-2">
              {schedule.recipes.map((recipe) => {
                const isExpanded = expandedRecipeId === recipe.recipeId;
                return (
                  <li
                    key={recipe.recipeId}
                    className="rounded-xl border border-olive/30 bg-canvas p-3"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedRecipeId(isExpanded ? null : recipe.recipeId)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                      )}
                      <span className="w-28 shrink-0 font-semibold tabular-nums text-olive">
                        {formatClockTime(recipe.startTimeMinutes)}
                      </span>
                      <span className="flex-1 font-serif font-semibold text-ink">
                        {recipe.recipeName}
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">
                        {formatTotalMinutes(recipe.totalMinutes)}
                        {recipe.hasUnstatedDurations && (
                          <span
                            title="Some steps don't state how long they take, so this dish's total is a lower bound."
                            className="ml-1.5 font-semibold text-clay-hover"
                          >
                            estimate
                          </span>
                        )}
                      </span>
                    </button>

                    {isExpanded && (
                      <ul className="mt-3 space-y-1.5 border-t border-olive/20 pt-3 pl-7">
                        {recipe.steps.length === 0 ? (
                          <li className="text-xs text-ink-muted">
                            This recipe has no steps recorded.
                          </li>
                        ) : (
                          recipe.steps.map((step) => (
                            <li key={step.stepIndex} className="flex items-start gap-3 text-xs">
                              <span className="w-24 shrink-0 tabular-nums text-ink-muted">
                                {formatClockTime(step.startTimeMinutes)}
                              </span>
                              <span className="flex-1 text-ink">{step.instruction}</span>
                              <span className="shrink-0 text-ink-muted">
                                {step.durationMinutes === null
                                  ? 'no time given'
                                  : formatTotalMinutes(step.durationMinutes)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>

            {anyEstimated && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-clay/40 bg-clay-light/40 p-3 text-xs text-clay-hover">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Dishes marked <strong>estimate</strong> have steps with no stated time, so they
                  may take longer than shown. Add timings to those steps for an accurate schedule.
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
