export type AppView = 'deck' | 'profiles' | 'plugins' | 'storage' | 'console' | 'settings';

export const VIEW_ORDER: AppView[] = [
  'deck',
  'profiles',
  'plugins',
  'storage',
  'console',
  'settings',
];

export const VIEW_META: Record<
  AppView,
  { title: string; subtitle: string; navLabel: string }
> = {
  deck: {
    title: 'Deck',
    subtitle: 'Configure keys and preview live output',
    navLabel: 'Deck',
  },
  profiles: {
    title: 'Profiles',
    subtitle: 'Saved key layouts and bindings',
    navLabel: 'Profiles',
  },
  plugins: {
    title: 'Plugins',
    subtitle: 'Install new action types, or build your own',
    navLabel: 'Plugins',
  },
  storage: {
    title: 'SD Card',
    subtitle: 'Icons and animations stored on the device',
    navLabel: 'Storage',
  },
  console: {
    title: 'Protocol Console',
    subtitle: 'TX/RX traffic between host and device',
    navLabel: 'Console',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Application preferences',
    navLabel: 'Settings',
  },
};

export function viewIndex(view: AppView): number {
  return VIEW_ORDER.indexOf(view);
}

export function viewDirection(from: AppView, to: AppView): 'up' | 'down' {
  return viewIndex(to) > viewIndex(from) ? 'down' : 'up';
}

const FIRST_RUN_KEY = 'osd-first-run-dismissed';

export function isFirstRunHintVisible(): boolean {
  return localStorage.getItem(FIRST_RUN_KEY) !== '1';
}

export function dismissFirstRunHint(): void {
  localStorage.setItem(FIRST_RUN_KEY, '1');
}

export function moveKeySelection(
  current: number | null,
  direction: 'up' | 'down' | 'left' | 'right',
  cols = 2,
): number {
  const index = current ?? 0;
  const rows = Math.ceil(6 / cols);
  const row = Math.floor(index / cols);
  const col = index % cols;

  switch (direction) {
    case 'up':
      return row > 0 ? index - cols : index;
    case 'down':
      return row < rows - 1 ? index + cols : index;
    case 'left':
      return col > 0 ? index - 1 : index;
    case 'right':
      return col < cols - 1 ? index + 1 : index;
    default:
      return index;
  }
}
