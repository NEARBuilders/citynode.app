import {
  type RenderHookOptions,
  type RenderOptions,
  renderHook as renderTestHook,
  render as renderView,
} from "@testing-library/react";
import { isValidElement, type ReactNode, StrictMode } from "react";
import {
  renderToStaticMarkup as renderStatic,
  renderToString as renderString,
} from "react-dom/server";
import { AppI18nProvider } from "./runtime";

const withLocale = (children: ReactNode): ReactNode =>
  isValidElement<{ children: ReactNode }>(children) && children.type === StrictMode ? (
    <StrictMode>{withLocale(children.props.children)}</StrictMode>
  ) : (
    <AppI18nProvider initialLocale="en" preferredLocale="en">
      {children}
    </AppI18nProvider>
  );

export const renderToStaticMarkup = (children: ReactNode) => renderStatic(withLocale(children));
export const renderToString = (children: ReactNode) => renderString(withLocale(children));

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
