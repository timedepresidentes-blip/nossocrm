declare module '@ffmpeg/core' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createFFmpegCore(module?: Record<string, any>): Promise<void>;
  export default createFFmpegCore;
}
