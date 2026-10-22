import {
  type RenderHookOptions,
  type RenderOptions,
  renderHook as renderTestHook,
  render as renderView,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { LoginI18nProvider } from "./runtime";

const withLocale = (children: ReactNode) => (
  <LoginI18nProvider initialLocale="en">{children}</LoginI18nProvider>
);

export function render(ui: ReactNode, options?: RenderOptions) {
  const view = renderView(withLocale(ui), options);
  return { ...view, rerender: (next: ReactNode) => view.rerender(withLocale(next)) };
}

export function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  options?: RenderHookOptions<Props>,
) {
  const Wrapper = options?.wrapper;
  return renderTestHook(callback, {
    ...options,
    wrapper: ({ children }) => withLocale(Wrapper ? <Wrapper>{children}</Wrapper> : children),
  });
}
