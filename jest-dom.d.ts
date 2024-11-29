import '@testing-library/jest-dom';

declare module '@testing-library/jest-dom' {
  interface CustomMatchers<R = unknown> {
    toBeInTheDocument(): R;
  }
}
