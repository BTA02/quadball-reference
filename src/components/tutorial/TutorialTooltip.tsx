import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { TooltipRenderProps } from 'react-joyride';
import { cn } from '../../lib/utils';

/**
 * The tutorial card. This is the only visual surface of the tour — everything
 * else (overlay, spotlight, positioning) is handled by the tour engine.
 */
export default function TutorialTooltip({
  index,
  size,
  isLastStep,
  step,
  backProps,
  primaryProps,
  skipProps,
  closeProps,
  tooltipProps,
  controls,
}: TooltipRenderProps) {
  // Arrow keys page through the tour; Escape ends it. The tooltip traps focus
  // while it's open, so this doesn't fight the app's own shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        controls.next('keyboard');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (index > 0) controls.prev('keyboard');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        controls.skip('button_skip');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [controls, index]);

  return (
    <div
      {...tooltipProps}
      className="w-[min(400px,calc(100vw-2rem))] bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden text-left"
    >
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-gray-100">
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-widest text-red-600">
            Step {index + 1} of {size}
          </span>
          {step.title && (
            <h3 className="text-lg font-extrabold text-gray-900 leading-tight mt-1">{step.title}</h3>
          )}
        </div>
        <button
          {...closeProps}
          className="shrink-0 p-1 -mr-1 -mt-1 rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          title="End tutorial"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 text-sm text-gray-700 leading-relaxed space-y-3 max-h-[45vh] overflow-y-auto custom-scrollbar">
        {step.content}
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
        {size <= 15 ? (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: size }, (_, i) => (
              <button
                key={i}
                onClick={() => controls.go(i)}
                aria-label={`Go to step ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-5 bg-red-600' : 'w-1.5 bg-gray-300 hover:bg-gray-400',
                )}
              />
            ))}
          </div>
        ) : (
          <button
            {...skipProps}
            className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors"
          >
            Skip tutorial
          </button>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {index > 0 && (
            <button
              {...backProps}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-all active:scale-95"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <button
            {...primaryProps}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all active:scale-95"
          >
            {isLastStep ? (
              <>
                Done <Check className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Next <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {size <= 15 && (
        <div className="px-5 pb-3 bg-gray-50 -mt-1">
          <button
            {...skipProps}
            className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors"
          >
            Skip tutorial
          </button>
        </div>
      )}
    </div>
  );
}
