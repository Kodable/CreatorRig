// The profiling build has the client API plus a working <Profiler onRender>; @types/react-dom has no entry for it.
declare module 'react-dom/profiling' {
  export * from 'react-dom/client';
}
