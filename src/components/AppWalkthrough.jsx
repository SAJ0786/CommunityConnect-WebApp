import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

const STEPS = [
  {
    target: null,
    title: 'Welcome to Community Events Australia',
    body: 'A quick tour of the main tools for finding, sharing, adding and following community programs.',
    kicker: 'Start here',
  },
  {
    target: 'city-and-view',
    title: 'Explore by city',
    body: 'Your home screen starts with your selected city. Change city anytime. Use the Map/List panel in Quick access below to change the view.',
    kicker: 'City + map',
  },
  {
    target: 'bottom-search',
    title: 'Search and filter faster',
    body: 'Search by event, host, suburb, audience, speaker, reciter or event type. Use the sliders for detailed filters.',
    kicker: 'Find programs',
  },
  {
    target: 'bottom-home',
    title: 'Browse event cards',
    body: 'Tap a card to expand it. Tap it again to collapse it. Cards show timing, suburb, audience, notes and privacy-aware details.',
    kicker: 'Home',
  },
  {
    target: 'bottom-calendar',
    title: 'View Calendar & Sync',
    body: 'Open the calendar view and subscribe once so events stay updated in your phone calendar.',
    kicker: 'Calendar',
  },
  {
    target: 'bottom-add',
    title: 'Add events',
    body: 'Add single events with a poster, Hijri or Gregorian date, fixed time or prayer time, notes, speakers and reciters.',
    guestBody: 'Sign in with your mobile number to add events, upload posters, set Hijri or Gregorian dates, and manage programs.',
    kicker: 'Create',
    authOnly: true,
  },
  {
    target: 'bottom-favourites',
    title: 'Save favourites',
    body: 'Use the heart on event cards to keep important programs in your favourites list.',
    guestBody: 'Sign in to save favourites and keep your important programs available across devices.',
    kicker: 'Saved',
    authOnly: true,
  },
  {
    target: 'top-bell',
    title: 'Today and tomorrow alerts',
    body: 'The bell shows upcoming events from now through tomorrow, grouped clearly by day.',
    guestBody: 'Sign in to use the bell alerts, email reminders and push notifications for upcoming programs.',
    kicker: 'Alerts',
    authOnly: true,
  },
  {
    target: 'top-hamburger',
    title: 'More tools in the menu',
    body: 'Use Menu in the bottom bar on mobile or at the top on PC for account tools, calendars and admin shortcuts.',
    kicker: 'Menu',
  },
  {
    target: 'bottom-profile',
    title: 'Your account menu',
    body: 'Open Menu, then My Profile to update your city, contact details, reminders and account settings.',
    guestBody: 'Sign in to manage your city, contact details, reminders, push notifications and account settings.',
    kicker: 'Profile',
    authOnly: true,
  },
  {
    target: null,
    title: 'You are ready',
    body: 'You can revisit help from the menu when needed. Enjoy exploring Community Events Australia.',
    kicker: 'All set',
  },
];

const TARGET_PADDING = 8;
const CARD_WIDTH = 308;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getStepList() {
  return STEPS;
}

export default function AppWalkthrough({ isGuest, userId, completed, onComplete }) {
  const steps = useMemo(() => getStepList(), []);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState(null);
  const [cardPos, setCardPos] = useState(null);

  useEffect(() => {
    setStep(0);
  }, [isGuest, userId]);

  useEffect(() => {
    if (isGuest) {
      setVisible(true);
      return;
    }
    if (!userId) {
      setVisible(false);
      return;
    }
    setVisible(completed === false);
  }, [isGuest, userId, completed]);

  const baseCurrent = steps[step] || steps[0];
  const current = baseCurrent && isGuest && baseCurrent.authOnly
    ? {
        ...baseCurrent,
        body: baseCurrent.guestBody || baseCurrent.body,
        kicker: `${baseCurrent.kicker} - sign in`,
      }
    : baseCurrent;
  const isFirst = step === 0;
  const isLast = step >= steps.length - 1;

  const dismiss = () => {
    setVisible(false);
    if (!isGuest && userId) onComplete?.();
  };

  const goBack = () => setStep(index => Math.max(0, index - 1));

  const next = () => {
    if (isLast) {
      dismiss();
      return;
    }
    setStep(index => Math.min(steps.length - 1, index + 1));
  };

  useLayoutEffect(() => {
    if (!visible || !current?.target) {
      setTargetRect(null);
      setCardPos(null);
      return undefined;
    }

    let raf = 0;

    const measure = () => {
      let target = document.querySelector(`[data-walkthrough-target="${current.target}"]`);
      if (!target?.getClientRects().length && ['top-hamburger','bottom-profile'].includes(current.target)) {
        target = [...document.querySelectorAll('[data-walkthrough-target="top-hamburger"], [data-walkthrough-target="bottom-profile"]')].find(item => item.getClientRects().length);
      }
      if (!target) {
        setTargetRect(null);
        setCardPos(null);
        return;
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

      raf = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padded = {
          left: clamp(rect.left - TARGET_PADDING, 10, viewportWidth - 30),
          top: clamp(rect.top - TARGET_PADDING, 10, viewportHeight - 30),
          width: Math.min(rect.width + TARGET_PADDING * 2, viewportWidth - 20),
          height: Math.min(rect.height + TARGET_PADDING * 2, viewportHeight - 20),
        };

        const isBottomTarget = current.target.startsWith('bottom-');
        const isSearchTarget = current.target === 'bottom-search';
        const isMenuTarget = current.target === 'top-hamburger';
        const cardWidth = isMenuTarget && viewportWidth < 520 ? 202 : CARD_WIDTH;
        const estimatedCardHeight = 230;
        const hasRoomBelow = padded.top + padded.height + estimatedCardHeight < viewportHeight;
        let top = hasRoomBelow
          ? padded.top + padded.height + 14
          : Math.max(16, padded.top - estimatedCardHeight);
        let left = clamp(
          padded.left + padded.width / 2 - cardWidth / 2,
          14,
          viewportWidth - cardWidth - 14
        );

        if (isBottomTarget) {
          top = clamp(92, 14, viewportHeight - estimatedCardHeight - 14);
        }

        if (isSearchTarget) {
          top = clamp(viewportHeight - estimatedCardHeight - 108, 14, viewportHeight - estimatedCardHeight - 14);
        }

        if (isMenuTarget) {
          top = clamp(14, 14, viewportHeight - estimatedCardHeight - 14);
          left = clamp(viewportWidth < 520 ? viewportWidth - cardWidth - 16 : 18, 14, viewportWidth - cardWidth - 14);
        }

        setTargetRect(padded);
        setCardPos({ left, top, width: cardWidth, placement: hasRoomBelow ? 'below' : 'above' });
      });
    };

    const timer = window.setTimeout(measure, 80);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [visible, current?.target]);

  if (!visible || !current) return null;

  const spotlightStyle = targetRect ? {
    left: targetRect.left,
    top: targetRect.top,
    width: targetRect.width,
    height: targetRect.height,
  } : null;

  const cardStyle = cardPos ? {
    left: cardPos.left,
    top: cardPos.top,
    width: cardPos.width,
  } : null;

  return (
    <div className="walkthrough-layer" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
      <style>{`
        .walkthrough-layer {
          position: fixed;
          inset: 0;
          z-index: 50000;
          font-family: inherit;
          pointer-events: auto;
        }
        .walkthrough-dim {
          position: absolute;
          inset: 0;
          background: color-mix(in srgb, var(--cc-overlay-base) 72%, transparent);
          backdrop-filter: blur(2px);
        }
        .walkthrough-spotlight {
          position: absolute;
          border-radius: 18px;
          border: 2px solid color-mix(in srgb, var(--cc-surface) 96%, transparent);
          box-shadow:
            0 0 0 9999px color-mix(in srgb, var(--cc-overlay-base) 72%, transparent),
            0 0 0 8px color-mix(in srgb, var(--cc-accent-strong) 22%, transparent),
            0 18px 42px color-mix(in srgb, var(--cc-overlay-base) 28%, transparent);
          background: transparent;
          pointer-events: none;
          transition: left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease;
        }
        .walkthrough-card {
          position: absolute;
          width: ${CARD_WIDTH}px;
          max-width: calc(100vw - 28px);
          background: var(--cc-surface);
          color: var(--cc-heading);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 22px 70px color-mix(in srgb, var(--cc-shadow-base) 34%, transparent);
          border: 1px solid color-mix(in srgb, var(--cc-accent-strong) 18%, transparent);
        }
        .walkthrough-card.center {
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        .walkthrough-kicker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--cc-accent-soft);
          color: var(--cc-accent-strong);
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 0.72rem;
          font-weight: 900;
          margin-bottom: 10px;
        }
        .walkthrough-title {
          margin: 0 0 8px;
          font-size: 1.05rem;
          line-height: 1.2;
          font-weight: 900;
          color: var(--cc-heading);
        }
        .walkthrough-body {
          margin: 0 0 14px;
          color: var(--cc-muted);
          font-size: 0.83rem;
          line-height: 1.5;
          font-weight: 650;
        }
        .walkthrough-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .walkthrough-left-actions,
        .walkthrough-right-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .walkthrough-btn {
          border: 0;
          border-radius: 12px;
          padding: 10px 13px;
          font-size: 0.78rem;
          font-weight: 900;
          cursor: pointer;
          box-shadow: none;
        }
        .walkthrough-btn.primary {
          background: var(--cc-accent-strong);
          color: var(--cc-on-primary);
        }
        .walkthrough-btn.ghost {
          background: transparent;
          color: var(--cc-muted);
        }
        .walkthrough-btn.secondary {
          background: var(--cc-accent-soft);
          color: var(--cc-text);
        }
        .walkthrough-progress {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          margin: 12px 0 2px;
        }
        .walkthrough-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--cc-border);
          transition: width 180ms ease, background 180ms ease;
        }
        .walkthrough-dot.active {
          width: 18px;
          background: var(--cc-accent-strong);
        }
        .walkthrough-counter {
          color: var(--cc-muted);
          font-size: 0.7rem;
          font-weight: 800;
          margin-top: 8px;
        }
        @media (max-width: 360px) {
          .walkthrough-card {
            padding: 14px;
          }
          .walkthrough-actions {
            align-items: stretch;
          }
          .walkthrough-btn {
            padding: 9px 11px;
          }
        }
      `}</style>

      {targetRect ? (
        <>
          <div className="walkthrough-spotlight" style={spotlightStyle} />
          <CoachCard
            current={current}
            steps={steps}
            step={step}
            isFirst={isFirst}
            isLast={isLast}
            onBack={goBack}
            onNext={next}
            onSkip={dismiss}
            style={cardStyle}
          />
        </>
      ) : (
        <>
          <div className="walkthrough-dim" onClick={next} />
          <CoachCard
            current={current}
            steps={steps}
            step={step}
            isFirst={isFirst}
            isLast={isLast}
            onBack={goBack}
            onNext={next}
            onSkip={dismiss}
            centered
          />
        </>
      )}
    </div>
  );
}

function CoachCard({ current, steps, step, isFirst, isLast, onBack, onNext, onSkip, style, centered = false }) {
  return (
    <div className={`walkthrough-card${centered ? ' center' : ''}`} style={style} onClick={event => event.stopPropagation()}>
      <div className="walkthrough-kicker">{current.kicker}</div>
      <h2 id="walkthrough-title" className="walkthrough-title">{current.title}</h2>
      <p className="walkthrough-body">{current.body}</p>

      <div className="walkthrough-actions">
        <div className="walkthrough-left-actions">
          {!isFirst && (
            <button type="button" className="walkthrough-btn secondary" onClick={onBack}>
              Back
            </button>
          )}
          {!isLast && (
            <button type="button" className="walkthrough-btn ghost" onClick={onSkip}>
              Skip
            </button>
          )}
        </div>
        <div className="walkthrough-right-actions">
          <button type="button" className="walkthrough-btn primary" onClick={onNext}>
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>

      <div className="walkthrough-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((_, index) => (
          <span key={index} className={`walkthrough-dot${index === step ? ' active' : ''}`} />
        ))}
      </div>
      <div className="walkthrough-counter">Step {step + 1} of {steps.length}</div>
    </div>
  );
}
