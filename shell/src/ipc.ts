/** IPC channel names shared by main and preload. */
export const IPC = {
  describe: 'shell:describe',
  fsReadBytes: 'fs:readBytes',
  fsReadText: 'fs:readText',
  fsWriteBytes: 'fs:writeBytes',
  fsWriteText: 'fs:writeText',
  fsExists: 'fs:exists',
  rootPath: 'paths:root',
  windowSetTitle: 'window:setTitle',
  windowSetFullscreen: 'window:setFullscreen',
  windowToggleFullscreen: 'window:toggleFullscreen',
  windowIsFullscreen: 'window:isFullscreen',
  powerCurrent: 'power:current',
  powerChanged: 'power:changed',
  reportProbe: 'diagnostics:reportProbe',
} as const;
