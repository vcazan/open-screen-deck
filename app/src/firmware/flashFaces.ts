/** Faces painted on the six keys just before a firmware flash.
 *  Matches firmware drawFlashingBanner() — the LCDs freeze on this after
 *  the MCU reboots into the ROM bootloader. */
export const FLASH_KEY_FACES: { label: string; sublabel: string; bg: number }[] = [
  { label: 'BOOT', sublabel: 'mode', bg: 0x1928 },
  { label: 'LOADER', sublabel: 'USB', bg: 0x1928 },
  { label: 'DO NOT', sublabel: 'wait', bg: 0xbaa0 },
  { label: 'UNPLUG', sublabel: 'USB in', bg: 0xbaa0 },
  { label: 'FLASH', sublabel: 'writing', bg: 0x0328 },
  { label: 'WAIT', sublabel: '~30 sec', bg: 0x0328 },
];
