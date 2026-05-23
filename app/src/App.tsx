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
import { ScreenBranding } from './screens/ScreenBranding';
import { ScreenFormat } from './screens/ScreenFormat';
import { ScreenTextType } from './screens/ScreenTextType';
import { ScreenProcessing } from './screens/ScreenProcessing';
import { ScreenResult } from './screens/ScreenResult';
import { ScreenMyBrand } from './screens/ScreenMyBrand';
import { ScreenExamples } from './screens/ScreenExamples';
import { ScreenPricing } from './screens/ScreenPricing';
import { ScreenPhotoHelp } from './screens/ScreenPhotoHelp';

const REGISTRY: Record<RouteId, () => JSX.Element> = {
  welcome:    ScreenWelcome,
  onboarding: ScreenOnboardingBrand,
  home:       ScreenHome,
  upload:     ScreenUpload,
  worktype:   ScreenWorkType,
  style:      ScreenStyle,
  brand:      ScreenBranding,
  format:     ScreenFormat,
  text:       ScreenTextType,
  proc:       ScreenProcessing,
  result:     ScreenResult,
  mybrand:    ScreenMyBrand,
  examples:   ScreenExamples,
  pricing:    ScreenPricing,
  help:       ScreenPhotoHelp,
};

function Root() {
  const { route } = useRouter();
  const Screen = REGISTRY[route];
  return <Screen />;
}

/**
 * Решает, куда отправить юзера при запуске:
 *  - онбординг пройден → home
 *  - первый запуск     → welcome (а welcome дальше уведёт на onboarding)
 */
function AppRouter() {
  const { onboarded } = useApp();
  return (
    <RouterProvider initial={onboarded ? 'home' : 'welcome'}>
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
