/** Shared 24×24 stroke icon paths used on key faces and in the inspector. */

export const KEY_ICONS: Record<string, string> = {
  mute: 'M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z M19 11a7 7 0 01-14 0 M12 18v4 M8 22h8 M3 3l18 18',
  mic: 'M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z M19 11a7 7 0 01-14 0 M12 18v4 M8 22h8',
  camera: 'M23 7l-7 5 7 5V7z M3 5h11a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2z',
  film: 'M3 3h18v18H3z M7 3v18 M17 3v18 M3 8h4 M17 8h4 M3 16h4 M17 16h4',
  record: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 8a4 4 0 100 8 4 4 0 000-8z',
  globe: 'M12 2a10 10 0 100 20 10 10 0 000-20z M2 12h20 M12 2c3 3 3 17 0 20 M12 2c-3 3-3 17 0 20',
  bolt: 'M13 2L3 14h7l-1 8 10-12h-7z',
  volume: 'M11 5L6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 010 7 M19 5a9 9 0 010 14',
  play: 'M6 4l14 8-14 8V4z',
  folder: 'M3 6a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z',
  star: 'M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.5 6.1 21l1.2-6.5L2.5 9.9 9.1 9z',
  terminal: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z M7 9l3 3-3 3 M13 15h4',
};

export const KEY_ICON_ORDER = [
  'mute',
  'mic',
  'camera',
  'film',
  'record',
  'globe',
  'bolt',
  'volume',
  'play',
  'folder',
  'star',
  'terminal',
] as const;
