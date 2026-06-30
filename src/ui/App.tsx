import { ThemeProvider } from './theme-provider';
import SocialTrackerApp from './social-tracker-app';
import { PrivosAppProvider } from '@privos/app-react';

export default function App() {
  return (
    <PrivosAppProvider>
      <ThemeProvider hostTheme="light">
        <SocialTrackerApp />
      </ThemeProvider>
    </PrivosAppProvider>
  );
}
