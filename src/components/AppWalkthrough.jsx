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
    body: 'Your home screen starts with your selected city. Change city anytime, then switch between List and Map view.',
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
    body: 'Open extra tools from here. Guests see restricted tools greyed out.',
    kicker: 'Menu',
  },
  {
    target: 'bottom-profile',
    title: 'Manage your settings',
    body: 'Update your city, contact details, email reminders, push notifications, support options and account settings.',
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

  useEffect(() => {
    if (!visible) return undefined;

    const shouldOpenMenu = current?.target === 'top-hamburger';
    window.dispatchEvent(new CustomEvent('community-events-walkthrough-menu', {
      detail: { open: shouldOpenMenu },
    }));

    return () => {
      if (shouldOpenMenu) {
        window.dispatchEvent(new CustomEvent('community-events-walkthrough-menu', {
          detail: { open: false },
        }));
      }
    };
  }, [visible, current?.target]);

  useLayoutEffect(() => {
    if (!visible || !current?.target) {
      setTargetRect(null);
      setCardPos(null);
      return undefined;
    }

    let raf = 0;

    const measure = () => {
      const target = document.querySelector(`[data-walkthrough-target="${current.target}"]`);
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
          background: rgba(7, 18, 25, 0.72);
          backdrop-filter: blur(2px);
        }
        .walkthrough-spotlight {
          position: absolute;
          border-radius: 18px;
          border: 2px solid rgba(255,255,255,0.96);
          box-shadow:
            0 0 0 9999px rgba(7, 18, 25, 0.72),
            0 0 0 8px rgba(15, 118, 110, 0.22),
            0 18px 42px rgba(0,0,0,0.28);
          background: transparent;
          pointer-events: none;
          transition: left 180ms ease, top 180ms ease, width 180ms ease, height 180ms ease;
        }
        .walkthrough-card {
          position: absolute;
          width: ${CARD_WIDTH}px;
          max-width: calc(100vw - 28px);
          background: #ffffff;
          color: #101828;
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 22px 70px rgba(0,0,0,0.34);
          border: 1px solid rgba(15,118,110,0.18);
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
          background: #e7f5f2;
          color: #0f766e;
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
          color: #101828;
        }
        .walkthrough-body {
          margin: 0 0 14px;
          color: #5f6f73;
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
          background: #0f766e;
          color: white;
        }
        .walkthrough-btn.ghost {
          background: transparent;
          color: #6f7d80;
        }
        .walkthrough-btn.secondary {
          background: #eef4f3;
          color: #102d2a;
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
          background: #d0dcda;
          transition: width 180ms ease, background 180ms ease;
        }
        .walkthrough-dot.active {
          width: 18px;
          background: #0f766e;
        }
        .walkthrough-counter {
          color: #758487;
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
