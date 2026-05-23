import { useEffect, useState } from 'react';
import { AppProvider } from './state/AppContext';
import { RouterProvider, useRouter, type RouteId } from './router/Router';
import { initTelegramWebApp } from './telegram/webapp';
import { Splash } from './components/Splash';

import { ScreenWelcome } from './screens/ScreenWelcome';
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
  welcome:  ScreenWelcome,
  home:     ScreenHome,
  upload:   ScreenUpload,
  worktype: ScreenWorkType,
  style:    ScreenStyle,
  brand:    ScreenBranding,
  format:   ScreenFormat,
  text:     ScreenTextType,
  proc:     ScreenProcessing,
  result:   ScreenResult,
  mybrand:  ScreenMyBrand,
  examples: ScreenExamples,
  pricing:  ScreenPricing,
  help:     ScreenPhotoHelp,
};

function Root() {
  const { route } = useRouter();
  const Screen = REGISTRY[route];
  return <Screen />;
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
      <RouterProvider initial="welcome">
        <Root />
      </RouterProvider>
      {booting && <Splash />}
    </AppProvider>
  );
}
