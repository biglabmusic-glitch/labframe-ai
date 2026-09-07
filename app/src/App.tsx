import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { RouterProvider, useRouter, type RouteId } from './router/Router';
import { initTelegramWebApp } from './telegram/webapp';
import { Splash } from './components/Splash';

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
  invite:          ScreenInvite,
  help:            ScreenPhotoHelp,
  consent:         ScreenConsent,
  privacy:         ScreenPrivacy,
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
  const { onboarded, consentAt, balanceLoaded } = useApp();
  if (!balanceLoaded) return null;

  const initial: RouteId = !consentAt ? 'consent' : onboarded ? 'home' : 'welcome';
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
