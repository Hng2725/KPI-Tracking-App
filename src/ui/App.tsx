import { ThemeProvider } from './theme-provider';
import SocialTrackerApp from './social-tracker-app';

export default function App() {
  return (
    <ThemeProvider hostTheme="light">
      <SocialTrackerApp />
    </ThemeProvider>
  );
}
