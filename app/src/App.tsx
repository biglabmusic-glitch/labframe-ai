import { lazy, Suspense, useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { RouterProvider, useRouter, type RouteId } from './router/Router';
import { getStartParam, initTelegramWebApp } from './telegram/webapp';
import { Splash } from './components/Splash';
import { StartupNotice } from './components/StartupNotice';
import { isBackendReady } from './api/client';

import { ScreenWelcome } from './screens/ScreenWelcome';
import { ScreenOnboardingBrand } from './screens/ScreenOnboardingBrand';
import { ScreenHome } from './screens/ScreenHome';
import { ScreenUpload } from './screens/ScreenUpload';
import { ScreenWorkType } from './screens/ScreenWorkType';
import { ScreenStyle } from './screens/ScreenStyle';
import { ScreenIndividuality } from './screens/ScreenIndividuality';
import { ScreenBranding } from './screens/ScreenBranding';
import { ScreenFormat } from './screens/ScreenFormat';
import { ScreenTextType } from './screens/ScreenTextType';
import { ScreenProcessing } from './screens/ScreenProcessing';
import { ScreenResult } from './screens/ScreenResult';
import { ScreenMyBrand } from './screens/ScreenMyBrand';
import { ScreenExamples } from './screens/ScreenExamples';
import { ScreenPricing } from './screens/ScreenPricing';
import { ScreenMyPlan } from './screens/ScreenMyPlan';
import { ScreenAdmin } from './screens/ScreenAdmin';
import { ScreenInvite } from './screens/ScreenInvite';
import { ScreenPhotoHelp } from './screens/ScreenPhotoHelp';
import { ScreenConsent } from './screens/ScreenConsent';
import { ScreenPrivacy } from './screens/ScreenPrivacy';
import { ScreenConsentDoc } from './screens/ScreenConsentDoc';
import { ScreenSmileInviteNotice } from './screens/ScreenSmileInviteNotice';

const SmilePreview = lazy(() => import('./screens/ScreenSmilePreview').then((m) => ({ default: m.ScreenSmilePreview })));

function SmilePreviewEntry() {
  const { user } = useApp();
  if (!user.canSmilePreview) return <ScreenHome />;
  return <Suspense fallback={<Splash />}><SmilePreview /></Suspense>;
}

const REGISTRY: Record<RouteId, () => JSX.Element> = {
  welcome:         ScreenWelcome,
  onboarding:      ScreenOnboardingBrand,
  home:            ScreenHome,
  upload:          ScreenUpload,
  worktype:        ScreenWorkType,
  style:           ScreenStyle,
  individuality:   ScreenIndividuality,
  brand:           ScreenBranding,
  format:          ScreenFormat,
  text:            ScreenTextType,
  proc:            ScreenProcessing,
  result:          ScreenResult,
  mybrand:         ScreenMyBrand,
  examples:        ScreenExamples,
  pricing:         ScreenPricing,
  myplan:          ScreenMyPlan,
  admin:           ScreenAdmin,
  'smile-preview': SmilePreviewEntry,
  invite:          ScreenInvite,
  help:            ScreenPhotoHelp,
  consent:         ScreenConsent,
  privacy:         ScreenPrivacy,
  consentdoc:      ScreenConsentDoc,
};

function Root() {
  const { route } = useRouter();
  const Screen = REGISTRY[route];
  return <Screen />;
}

/**
 * Решает, куда отправить юзера при запуске:
 *  - согласие не дано  → consent (и дальше никуда, пока не согласится)
 *  - онбординг пройден → home
 *  - первый запуск     → welcome (а welcome дальше уведёт на onboarding)
 *
 * До ответа /me не поднимаем роутер вовсе: initial вычисляется один раз, и,
 * решив раньше времени, мы показали бы экран согласия тому, кто его давно дал.
 * Пустоты на экране при этом нет — сверху ещё висит сплэш.
 */
function AppRouter() {
  const { user, onboarded, consentAt, consentKnown, balanceLoaded, balanceKnown, syncing, startupError, retryStartup } = useApp();
  const [inviteDismissed, setInviteDismissed] = useState(false);
  const inviteLaunch = !inviteDismissed && getStartParam().startsWith('smile_');
  if (!balanceLoaded) return null;
  // RouterProvider captures its initial route once. Do not mount it until the
  // signed profile is known, including after a timeout or authentication failure.
  if (isBackendReady() && !balanceKnown) {
    return <StartupNotice error={startupError} retry={retryStartup} />;
  }

  // Do not mount the router with a wrong initial route while invite redemption
  // is still running after the ordinary app's six-second loading failsafe.
  if (inviteLaunch && !balanceKnown && syncing) return <Splash />;
  if (inviteLaunch && !user.canSmilePreview) {
    return <ScreenSmileInviteNotice
      status={balanceKnown ? user.smileInviteStatus : 'unavailable'}
      onContinue={() => setInviteDismissed(true)}
      onRetry={() => window.location.reload()}
    />;
  }

  // Запираем на согласии только когда точно знаем, что его нет. Если /me не
  // ответил, пускаем как раньше: иначе сетевой сбой запер бы и тех, кто
  // согласие давно дал, — сохранить его в этот момент всё равно невозможно.
  const needConsent = consentKnown && !consentAt;
  const initial: RouteId = needConsent ? 'consent'
    : inviteLaunch && user.canSmilePreview ? 'smile-preview'
    : onboarded ? 'home' : 'welcome';
  return (
    <RouterProvider initial={initial}>
      <Root />
    </RouterProvider>
  );
}

const SPLASH_MS = 900;

export default function App() {
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    initTelegramWebApp();
    const t = setTimeout(() => setBooting(false), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <AppProvider>
      <AppRouter />
      {booting && <Splash />}
    </AppProvider>
  );
}
